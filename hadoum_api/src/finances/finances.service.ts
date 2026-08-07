import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseWorkflowStatus,
  TransactionType,
  TransactionCategory,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpsertBudgetLineDto } from './dto/upsert-budget-line.dto';
import { xofToEur, DEFAULT_BUDGET_CATEGORIES } from './finances.constants';
import { ExpenseWorkflowService } from './expense-workflow.service';
import { BudgetService } from './budget.service';

// PR 5C: once an expense has been approved, amount/category/date/type are
// what its budget reservation was calculated from — changing any of them
// through the generic PATCH would silently invalidate that reservation
// without ever re-checking availability. Locked from APPROVED onward
// (including the COMPLETED/CANCELLED states reached from it); NOT locked
// during PENDING_APPROVAL or REJECTED, where fixing a mistake before/after
// a decision is exactly what the workflow expects.
const FINANCIALLY_LOCKED_STATES: ExpenseWorkflowStatus[] = [
  'APPROVED',
  'COMPLETED',
  'CANCELLED',
];

interface TransactionFilters {
  type?: TransactionType;
  category?: TransactionCategory;
  status?: TransactionStatus;
  from?: string;
  to?: string;
}

@Injectable()
export class FinancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly expenseWorkflowService: ExpenseWorkflowService,
    private readonly budgetService: BudgetService,
  ) {}

  // ─── Expense approval workflow (PR 5A/5B) ──────────────────────────────
  //
  // Pure delegation — every transition rule and the ValidationRequest
  // integration live in ExpenseWorkflowService (the one central state
  // machine), never here. See its file for the allowed-transitions table.

  submitExpense(id: string, submittedById: string, comment?: string) {
    return this.expenseWorkflowService.submit(id, submittedById, comment);
  }

  approveExpense(id: string, reviewedById: string, comment?: string) {
    return this.expenseWorkflowService.approve(id, reviewedById, comment);
  }

  rejectExpense(id: string, reviewedById: string, comment: string) {
    return this.expenseWorkflowService.reject(id, reviewedById, comment);
  }

  resubmitExpense(id: string, submittedById: string, comment?: string) {
    return this.expenseWorkflowService.resubmit(id, submittedById, comment);
  }

  completeExpense(id: string) {
    return this.expenseWorkflowService.complete(id);
  }

  cancelExpense(id: string) {
    return this.expenseWorkflowService.cancel(id);
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  private readonly supplierContactInclude = {
    supplierContact: { include: { category: true } },
  };

  /**
   * A new supplier assignment must point at a real, currently-active
   * Contact — mirrors ContactsService/MaintenanceTicketsService exactly. An
   * inactive contact can still be *read* on a historical expense, it just
   * can't be newly attached.
   */
  private async assertContactAssignable(contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      throw new BadRequestException('Contact introuvable.');
    }
    if (!contact.active) {
      throw new BadRequestException(
        'Ce contact est désactivé et ne peut pas être assigné à une nouvelle dépense.',
      );
    }
    return contact;
  }

  /**
   * supplierContactId only ever makes sense for DEPENSE — RECETTE has no
   * supplier concept (donorName/isAnonymousDonor cover that side). Rejecting
   * it outright, rather than silently ignoring it, keeps the two paths from
   * ever producing a RECETTE with a dangling supplier that the UI never
   * shows — an explicit 400 catches a caller's mistake instead of hiding it.
   */
  private assertNoSupplierOnIncome(
    type: TransactionType,
    supplierContactId: string | null | undefined,
  ) {
    if (type === TransactionType.RECETTE && supplierContactId) {
      throw new BadRequestException(
        'Un fournisseur ne peut pas être associé à une recette.',
      );
    }
  }

  async createTransaction(dto: CreateTransactionDto) {
    this.assertNoSupplierOnIncome(dto.type, dto.supplierContactId);

    let supplierContactId: string | undefined;
    if (dto.type === TransactionType.DEPENSE && dto.supplierContactId) {
      const contact = await this.assertContactAssignable(dto.supplierContactId);
      supplierContactId = contact.id;
    }

    return this.prisma.transaction.create({
      data: {
        type: dto.type,
        category: dto.category,
        label: dto.label,
        amountXof: dto.amountXof,
        date: new Date(dto.date),
        status: dto.status ?? TransactionStatus.EN_ATTENTE,
        donorName: dto.donorName,
        isAnonymousDonor: dto.isAnonymousDonor,
        createdBy: dto.createdBy,
        supplierContactId,
        paymentMethod: dto.paymentMethod,
      },
      include: this.supplierContactInclude,
    });
  }

  findAllTransactions(filters: TransactionFilters) {
    return this.prisma.transaction.findMany({
      where: {
        type: filters.type,
        category: filters.category,
        status: filters.status,
        date: {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(filters.to) : undefined,
        },
      },
      include: this.supplierContactInclude,
      orderBy: { date: 'desc' },
    });
  }

  async findOneTransaction(id: string) {
    // No `active` filter on the included Contact — a transaction referencing
    // a since-deactivated supplier must stay fully readable (same rule
    // Contact/MaintenanceTicket already apply to their own relations).
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: this.supplierContactInclude,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private async findRawTransaction(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private assertFinancialFieldsUnlocked(
    existing: {
      expenseWorkflowStatus: ExpenseWorkflowStatus | null;
      amountXof: number;
      category: TransactionCategory;
      date: Date;
      type: TransactionType;
    },
    dto: UpdateTransactionDto,
  ) {
    if (
      !existing.expenseWorkflowStatus ||
      !FINANCIALLY_LOCKED_STATES.includes(existing.expenseWorkflowStatus)
    ) {
      return;
    }
    const touchesLockedField =
      (dto.amountXof !== undefined && dto.amountXof !== existing.amountXof) ||
      (dto.category !== undefined && dto.category !== existing.category) ||
      (dto.date !== undefined &&
        new Date(dto.date).getTime() !== existing.date.getTime()) ||
      (dto.type !== undefined && dto.type !== existing.type);
    if (touchesLockedField) {
      throw new ConflictException(
        "Le montant, la catégorie, la date et le type d'une dépense ne peuvent plus être modifiés une fois approuvée.",
      );
    }
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto) {
    const existing = await this.findRawTransaction(id);
    const effectiveType = dto.type ?? existing.type;
    this.assertNoSupplierOnIncome(effectiveType, dto.supplierContactId);
    this.assertFinancialFieldsUnlocked(existing, dto);

    // Same three-state contract as MaintenanceTicket.assignedContactId (PR
    // 3): omitted leaves the relation untouched; an id validates and
    // (re)connects; explicit `null` disconnects it. `status` is deliberately
    // never touched here beyond whatever the caller explicitly sends — this
    // PR does not introduce any automatic status transition.
    let supplierUpdate: { supplierContactId?: string | null } = {};
    if (dto.supplierContactId !== undefined) {
      if (dto.supplierContactId === null) {
        supplierUpdate = { supplierContactId: null };
      } else {
        const contact = await this.assertContactAssignable(
          dto.supplierContactId,
        );
        supplierUpdate = { supplierContactId: contact.id };
      }
    }

    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.amountXof !== undefined ? { amountXof: dto.amountXof } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.donorName !== undefined ? { donorName: dto.donorName } : {}),
        ...(dto.isAnonymousDonor !== undefined
          ? { isAnonymousDonor: dto.isAnonymousDonor }
          : {}),
        ...(dto.paymentMethod !== undefined
          ? { paymentMethod: dto.paymentMethod }
          : {}),
        ...supplierUpdate,
      },
      include: this.supplierContactInclude,
    });
  }

  async uploadJustificatif(id: string, file: Express.Multer.File) {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.justifKey)
      await this.uploadService.deleteFile(existing.justifKey);
    const justifKey = await this.uploadService.upload(
      file,
      `finances/${id}/justificatif`,
    );
    return this.prisma.transaction.update({
      where: { id },
      data: { justifKey, justifMime: file.mimetype },
    });
  }

  async getJustificatifUrl(
    id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (!transaction.justifKey)
      throw new NotFoundException('No justificatif uploaded');
    const url = await this.uploadService.getPresignedUrl(transaction.justifKey);
    return { url, expiresIn: 900 };
  }

  async deleteTransaction(id: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    const keys = [
      transaction.justifKey,
      transaction.purchaseOrderKey,
      transaction.invoiceKey,
      transaction.deliveryNoteKey,
    ].filter((k): k is string => !!k);
    await Promise.all(keys.map((k) => this.uploadService.deleteFile(k)));
    await this.prisma.transaction.delete({ where: { id } });
  }

  // ─── Dedicated expense documents (PR 4) ────────────────────────────────────
  //
  // Additive alongside justifKey/justificatif above, which is left entirely
  // untouched for backward compatibility. DEPENSE-only: RECETTE has no
  // supplier/procurement paper trail concept, so uploading one of these to
  // a RECETTE is rejected rather than silently accepted.

  private async assertExpenseTransaction(id: string) {
    const transaction = await this.findRawTransaction(id);
    if (transaction.type !== TransactionType.DEPENSE) {
      throw new BadRequestException(
        'Ce document ne peut être ajouté qu’à une dépense.',
      );
    }
    return transaction;
  }

  async uploadPurchaseOrder(id: string, file: Express.Multer.File) {
    const existing = await this.assertExpenseTransaction(id);
    // Upload the new file and point the row at it *before* removing the old
    // one (see ContactsService.uploadPhoto for the same reasoning) — a
    // mid-operation failure never leaves the field pointing at an
    // already-deleted object, and never touches the transaction row itself.
    const purchaseOrderKey = await this.uploadService.upload(
      file,
      `finances/${id}/purchase-order`,
    );
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { purchaseOrderKey, purchaseOrderMime: file.mimetype },
      include: this.supplierContactInclude,
    });
    if (existing.purchaseOrderKey) {
      await this.uploadService
        .deleteFile(existing.purchaseOrderKey)
        .catch(() => {});
    }
    return updated;
  }

  async getPurchaseOrderUrl(
    id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const transaction = await this.findRawTransaction(id);
    if (!transaction.purchaseOrderKey) {
      throw new NotFoundException('No purchase order uploaded');
    }
    const url = await this.uploadService.getPresignedUrl(
      transaction.purchaseOrderKey,
    );
    return { url, expiresIn: 900 };
  }

  async deletePurchaseOrder(id: string) {
    const transaction = await this.findRawTransaction(id);
    if (transaction.purchaseOrderKey) {
      await this.uploadService.deleteFile(transaction.purchaseOrderKey);
    }
    return this.prisma.transaction.update({
      where: { id },
      data: { purchaseOrderKey: null, purchaseOrderMime: null },
      include: this.supplierContactInclude,
    });
  }

  async uploadInvoice(id: string, file: Express.Multer.File) {
    const existing = await this.assertExpenseTransaction(id);
    const invoiceKey = await this.uploadService.upload(
      file,
      `finances/${id}/invoice`,
    );
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { invoiceKey, invoiceMime: file.mimetype },
      include: this.supplierContactInclude,
    });
    if (existing.invoiceKey) {
      await this.uploadService.deleteFile(existing.invoiceKey).catch(() => {});
    }
    return updated;
  }

  async getInvoiceUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const transaction = await this.findRawTransaction(id);
    if (!transaction.invoiceKey) {
      throw new NotFoundException('No invoice uploaded');
    }
    const url = await this.uploadService.getPresignedUrl(
      transaction.invoiceKey,
    );
    return { url, expiresIn: 900 };
  }

  async deleteInvoice(id: string) {
    const transaction = await this.findRawTransaction(id);
    if (transaction.invoiceKey) {
      await this.uploadService.deleteFile(transaction.invoiceKey);
    }
    return this.prisma.transaction.update({
      where: { id },
      data: { invoiceKey: null, invoiceMime: null },
      include: this.supplierContactInclude,
    });
  }

  async uploadDeliveryNote(id: string, file: Express.Multer.File) {
    const existing = await this.assertExpenseTransaction(id);
    const deliveryNoteKey = await this.uploadService.upload(
      file,
      `finances/${id}/delivery-note`,
    );
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { deliveryNoteKey, deliveryNoteMime: file.mimetype },
      include: this.supplierContactInclude,
    });
    if (existing.deliveryNoteKey) {
      await this.uploadService
        .deleteFile(existing.deliveryNoteKey)
        .catch(() => {});
    }
    return updated;
  }

  async getDeliveryNoteUrl(
    id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const transaction = await this.findRawTransaction(id);
    if (!transaction.deliveryNoteKey) {
      throw new NotFoundException('No delivery note uploaded');
    }
    const url = await this.uploadService.getPresignedUrl(
      transaction.deliveryNoteKey,
    );
    return { url, expiresIn: 900 };
  }

  async deleteDeliveryNote(id: string) {
    const transaction = await this.findRawTransaction(id);
    if (transaction.deliveryNoteKey) {
      await this.uploadService.deleteFile(transaction.deliveryNoteKey);
    }
    return this.prisma.transaction.update({
      where: { id },
      data: { deliveryNoteKey: null, deliveryNoteMime: null },
      include: this.supplierContactInclude,
    });
  }

  // ─── Budget lines ────────────────────────────────────────────────────────

  findBudgetLines(year: number, month: number) {
    return this.prisma.budgetLine.findMany({ where: { year, month } });
  }

  upsertBudgetLine(dto: UpsertBudgetLineDto) {
    return this.prisma.budgetLine.upsert({
      where: {
        category_month_year: {
          category: dto.category,
          month: dto.month,
          year: dto.year,
        },
      },
      update: { budgetXof: dto.budgetXof },
      create: dto,
    });
  }

  async deleteBudgetLine(id: string): Promise<void> {
    const line = await this.prisma.budgetLine.findUnique({ where: { id } });
    if (!line) throw new NotFoundException('Budget line not found');
    await this.prisma.budgetLine.delete({ where: { id } });
  }

  /**
   * PR 6 — idempotently seeds the standing default budget for the current
   * month only (never a caller-supplied period, so this can never fabricate
   * budget history for a past month). `createMany` + `skipDuplicates` is a
   * single atomic, race-safe statement: the existing `@@unique([category,
   * month, year])` constraint means a row that already exists (whether it
   * still holds the default or a Director has since edited it) is silently
   * left untouched — this never updates, only inserts what's missing. Safe
   * to call on every page load.
   */
  async ensureDefaultBudgetLines() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    await this.prisma.budgetLine.createMany({
      data: DEFAULT_BUDGET_CATEGORIES.map((d) => ({ ...d, month, year })),
      skipDuplicates: true,
    });
    return this.findBudgetLines(year, month);
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────

  async getDashboard(year: number, month: number) {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const [recettesValidees, depensesValidees] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amountXof: true },
        where: {
          type: TransactionType.RECETTE,
          status: TransactionStatus.VALIDE,
        },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amountXof: true },
        where: {
          type: TransactionType.DEPENSE,
          status: TransactionStatus.VALIDE,
        },
      }),
    ]);
    const soldeCaisseXof =
      (recettesValidees._sum.amountXof ?? 0) -
      (depensesValidees._sum.amountXof ?? 0);

    const [byCategoryRaw, budgetLines, availabilityByCategory] =
      await Promise.all([
        this.prisma.transaction.groupBy({
          by: ['category'],
          _sum: { amountXof: true },
          where: {
            type: TransactionType.DEPENSE,
            status: TransactionStatus.VALIDE,
            date: { gte: monthStart, lt: monthEnd },
          },
        }),
        this.prisma.budgetLine.findMany({ where: { year, month } }),
        // PR 5C — additive: reservedXof/consumedXof/availableXof, derived
        // from expenseWorkflowStatus, computed alongside the untouched
        // legacy realizedXof query above (never merged into it).
        this.budgetService.getAllCategoriesAvailability(year, month),
      ]);

    const budgetByCategory = new Map(
      budgetLines.map((b) => [b.category, b.budgetXof]),
    );
    const realizedByCategory = new Map(
      byCategoryRaw.map((r) => [r.category, r._sum.amountXof ?? 0]),
    );
    const categories = new Set([
      ...budgetByCategory.keys(),
      ...realizedByCategory.keys(),
      ...availabilityByCategory.keys(),
    ]);

    const percentage = (value: number, budgetXof: number | null) =>
      budgetXof === null || budgetXof === 0
        ? null
        : Math.round((value / budgetXof) * 10000) / 100;

    const byCategory = Array.from(categories).map((category) => {
      const realizedXof = realizedByCategory.get(category) ?? 0;
      const budgetXof = budgetByCategory.get(category) ?? null;
      const ecartXof = budgetXof !== null ? budgetXof - realizedXof : null;
      const { reservedXof, consumedXof } = availabilityByCategory.get(
        category,
      ) ?? { reservedXof: 0, consumedXof: 0 };
      const totalCommittedXof = reservedXof + consumedXof;
      const availableXof =
        budgetXof !== null ? budgetXof - totalCommittedXof : null;
      return {
        category,
        realizedXof,
        realizedEur: xofToEur(realizedXof),
        budgetXof,
        ecartXof,
        overBudget: budgetXof !== null && realizedXof > budgetXof,
        // PR 5C additions — existing fields above are untouched.
        reservedXof,
        consumedXof,
        availableXof,
        reservedPercentage: percentage(reservedXof, budgetXof),
        consumedPercentage: percentage(consumedXof, budgetXof),
        totalCommittedPercentage: percentage(totalCommittedXof, budgetXof),
        committedOverBudget:
          budgetXof !== null && totalCommittedXof > budgetXof,
      };
    });

    const monthlyTrend = await this.getMonthlyTrend(year, month);

    const alerts = byCategory
      .filter((c) => c.overBudget)
      .map((c) => ({
        category: c.category,
        message: `Dépassement du budget ${c.category}`,
        realizedXof: c.realizedXof,
        budgetXof: c.budgetXof as number,
      }));

    return {
      period: { year, month },
      soldeCaisseXof,
      soldeCaisseEur: xofToEur(soldeCaisseXof),
      byCategory,
      monthlyTrend,
      alerts,
    };
  }

  private async getMonthlyTrend(year: number, month: number) {
    const months: { year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(year, month - 1 - i, 1));
      months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    }

    const sums = await Promise.all(
      months.map(async ({ year: y, month: m }) => {
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end = new Date(Date.UTC(y, m, 1));
        const [depenses, recettes] = await Promise.all([
          this.prisma.transaction.aggregate({
            _sum: { amountXof: true },
            where: {
              type: TransactionType.DEPENSE,
              status: TransactionStatus.VALIDE,
              date: { gte: start, lt: end },
            },
          }),
          this.prisma.transaction.aggregate({
            _sum: { amountXof: true },
            where: {
              type: TransactionType.RECETTE,
              status: TransactionStatus.VALIDE,
              date: { gte: start, lt: end },
            },
          }),
        ]);
        return {
          year: y,
          month: m,
          depensesXof: depenses._sum.amountXof ?? 0,
          recettesXof: recettes._sum.amountXof ?? 0,
        };
      }),
    );

    return sums;
  }
}
