import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseWorkflowStatus,
  Prisma,
  Transaction,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationsService } from '../validations/validations.service';
import { BudgetService } from './budget.service';
import { NotificationsService } from '../notifications/notifications.service';

// The one central state machine for the expense approval workflow (PR 5A).
// Every transition — from every caller, present and future — must pass
// through this service; nothing outside it may write
// `Transaction.expenseWorkflowStatus`.
//
// `null` (the value every pre-PR-5A row, and every RECETTE, has and keeps)
// is treated as its own state — "not part of the workflow" — represented
// internally by the NULL_STATE sentinel since a real `null` can't be an
// object key.

const NULL_STATE = 'NULL' as const;
type WorkflowState = typeof NULL_STATE | ExpenseWorkflowStatus;

const ALLOWED_TRANSITIONS: Record<WorkflowState, ExpenseWorkflowStatus[]> = {
  [NULL_STATE]: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  REJECTED: ['PENDING_APPROVAL'],
  APPROVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function toState(status: ExpenseWorkflowStatus | null): WorkflowState {
  return status ?? NULL_STATE;
}

const EXPENSE_INCLUDE = {
  supplierContact: { include: { category: true } },
} satisfies Prisma.TransactionInclude;

type Db = Prisma.TransactionClient;

@Injectable()
export class ExpenseWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationsService: ValidationsService,
    private readonly budgetService: BudgetService,
    private readonly notificationsService: NotificationsService,
  ) {}

  canTransition(
    from: ExpenseWorkflowStatus | null,
    to: ExpenseWorkflowStatus,
  ): boolean {
    return ALLOWED_TRANSITIONS[toState(from)].includes(to);
  }

  validateTransition(
    from: ExpenseWorkflowStatus | null,
    to: ExpenseWorkflowStatus,
  ): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException(
        `Transition impossible de "${from ?? 'NULL'}" vers "${to}".`,
      );
    }
  }

  private async findTransaction(id: string, tx?: Db): Promise<Transaction> {
    const db = tx ?? this.prisma;
    const transaction = await db.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  /**
   * The race-safe persistence gate (PR 5B): a plain `update` has no way to
   * fail if the row moved under it, so two concurrent decisions on the same
   * expense could otherwise both "succeed" (last write wins). Guarding the
   * write with the expected current state as a `WHERE` predicate means only
   * the first of two racing transactions can ever match a row — Postgres
   * serializes the second behind the first's row lock and re-evaluates the
   * predicate against the now-committed state, so it matches zero rows.
   * Does not change what transitions are allowed (see ALLOWED_TRANSITIONS
   * above) — only how the write is made safe under concurrency.
   */
  private async atomicWrite(
    tx: Db,
    id: string,
    from: ExpenseWorkflowStatus | null,
    to: ExpenseWorkflowStatus,
  ): Promise<void> {
    const result = await tx.transaction.updateMany({
      where: { id, expenseWorkflowStatus: from },
      data: { expenseWorkflowStatus: to },
    });
    if (result.count === 0) {
      const current = await tx.transaction.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Transaction not found');
      throw new ConflictException(
        `Transition impossible de "${current.expenseWorkflowStatus ?? 'NULL'}" vers "${to}".`,
      );
    }
  }

  private async performTransition(id: string, to: ExpenseWorkflowStatus) {
    const transaction = await this.findTransaction(id);
    this.validateTransition(transaction.expenseWorkflowStatus, to);
    // No ValidationRequest here: APPROVED -> COMPLETED / CANCELLED are
    // Director-side lifecycle actions, not Supervisor approval decisions
    // (PR 5B section 7) — only submit/approve/reject/resubmit touch the
    // validation engine.
    return this.prisma.transaction.update({
      where: { id },
      data: { expenseWorkflowStatus: to },
      include: EXPENSE_INCLUDE,
    });
  }

  /** "La dépense "X" de N FCFA <suffix>." with the supplier appended when present (PR 5D). */
  private describeExpense(
    transaction: Pick<Transaction, 'label' | 'amountXof'> & {
      supplierContact?: { fullName: string } | null;
    },
    suffix: string,
  ): string {
    const supplierPart = transaction.supplierContact
      ? ` (fournisseur : ${transaction.supplierContact.fullName})`
      : '';
    return `La dépense "${transaction.label}" de ${transaction.amountXof} FCFA${supplierPart} ${suffix}.`;
  }

  /**
   * NULL → PENDING_APPROVAL. Only DEPENSE transactions may enter the
   * workflow. Atomically creates the ValidationRequest that will drive the
   * Supervisor's decision — same DB transaction as the status write, so
   * either both persist or neither does.
   *
   * PR 5D: the SUPERVISOR notification below runs strictly *after* the DB
   * transaction above has committed — if anything inside it throws (wrong
   * type, wrong state, a losing race), execution never reaches this line,
   * so a failed or conflicting submit can never produce a notification.
   */
  async submit(id: string, submittedById: string, comment?: string) {
    const transaction = await this.prisma.$transaction(async (tx) => {
      const current = await this.findTransaction(id, tx);
      if (current.type !== TransactionType.DEPENSE) {
        throw new BadRequestException(
          "Seule une dépense peut être soumise à l'approbation.",
        );
      }
      this.validateTransition(
        current.expenseWorkflowStatus,
        'PENDING_APPROVAL',
      );
      await this.atomicWrite(tx, id, null, 'PENDING_APPROVAL');
      await this.validationsService.create(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: id,
          submittedById,
          comment,
        },
        tx,
      );
      return tx.transaction.findUniqueOrThrow({
        where: { id },
        include: EXPENSE_INCLUDE,
      });
    });

    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'EXPENSE_TRANSACTION',
      resourceId: id,
      title: 'Nouvelle dépense à valider',
      message: this.describeExpense(transaction, 'nécessite une validation'),
    });

    return transaction;
  }

  /**
   * PENDING_APPROVAL → APPROVED. Requires an active pending ValidationRequest
   * AND enough available budget (PR 5C) — the requested amount becomes
   * reserved. Budget period comes from `transaction.date` (the month/year
   * the expense belongs to), never the approval timestamp (section 14):
   * an expense dated 31 August approved on 1 September still reserves
   * against August's budget.
   */
  async approve(id: string, reviewedById: string, comment?: string) {
    let submittedById = '';

    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await this.findTransaction(id, tx);
      this.validateTransition(transaction.expenseWorkflowStatus, 'APPROVED');

      const month = transaction.date.getUTCMonth() + 1;
      const year = transaction.date.getUTCFullYear();

      // Row-locks the matching BudgetLine (if any) for the rest of this DB
      // transaction — see BudgetService.lockBudgetLine for why this is the
      // concurrency anchor that makes "only one of two racing approvals
      // wins" hold even though reserved/consumed are computed, not stored.
      const budgetLine = await this.budgetService.lockBudgetLine(
        tx,
        transaction.category,
        month,
        year,
      );
      if (!budgetLine) {
        throw new BadRequestException({
          code: 'NO_BUDGET_LINE',
          message:
            "Aucun budget n'est défini pour cette catégorie et cette période.",
        });
      }

      const { reservedXof, consumedXof } =
        await this.budgetService.getCategoryAvailability(
          tx,
          transaction.category,
          month,
          year,
        );
      // The transaction being approved is still PENDING_APPROVAL at this
      // point, so it is never itself included in reservedXof/consumedXof
      // above (both are scoped to APPROVED/COMPLETED only) — no self-
      // exclusion needed for idempotency.
      const availableXof = budgetLine.budgetXof - reservedXof - consumedXof;
      if (transaction.amountXof > availableXof) {
        throw new ConflictException({
          code: 'INSUFFICIENT_BUDGET',
          message:
            'Budget disponible insuffisant pour approuver cette dépense.',
          budgetXof: budgetLine.budgetXof,
          reservedXof,
          consumedXof,
          availableXof,
          requestedXof: transaction.amountXof,
        });
      }

      await this.atomicWrite(tx, id, 'PENDING_APPROVAL', 'APPROVED');
      const validation = await this.validationsService.approve(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: id,
          reviewedById,
          comment,
        },
        tx,
      );
      submittedById = validation.submittedById;
      return tx.transaction.findUniqueOrThrow({
        where: { id },
        include: EXPENSE_INCLUDE,
      });
    });

    // PR 5D: notify the submitting DIRECTOR only after the transaction above
    // has committed — a budget rejection, a lost concurrency race, or any
    // other failure inside it never reaches this line.
    await this.notificationsService.create({
      recipientId: submittedById,
      type: 'VALIDATION_APPROVED',
      resourceType: 'EXPENSE_TRANSACTION',
      resourceId: id,
      title: 'Dépense approuvée',
      message: this.describeExpense(result, 'a été approuvée'),
    });

    return result;
  }

  /** PENDING_APPROVAL → REJECTED. A non-empty comment is mandatory. */
  async reject(id: string, reviewedById: string, comment: string) {
    if (!comment || comment.trim().length === 0) {
      throw new BadRequestException('Un commentaire de refus est requis.');
    }

    let submittedById = '';
    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await this.findTransaction(id, tx);
      this.validateTransition(transaction.expenseWorkflowStatus, 'REJECTED');
      await this.atomicWrite(tx, id, 'PENDING_APPROVAL', 'REJECTED');
      const validation = await this.validationsService.reject(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: id,
          reviewedById,
          comment,
        },
        tx,
      );
      submittedById = validation.submittedById;
      return tx.transaction.findUniqueOrThrow({
        where: { id },
        include: EXPENSE_INCLUDE,
      });
    });

    // PR 5D: notify the submitting DIRECTOR — only reached once the
    // transaction above has committed (same failure-never-notifies
    // reasoning as approve()).
    await this.notificationsService.create({
      recipientId: submittedById,
      type: 'VALIDATION_REJECTED',
      resourceType: 'EXPENSE_TRANSACTION',
      resourceId: id,
      title: 'Dépense refusée',
      message: `${this.describeExpense(result, 'a été refusée')} Motif : ${comment}`,
    });

    return result;
  }

  /**
   * REJECTED → PENDING_APPROVAL only. Cannot reuse `performTransition`/a
   * generic table lookup here: PENDING_APPROVAL is reachable from both NULL
   * (via `submit`) and REJECTED (via this method), so this method must only
   * ever accept REJECTED as the source. Creates a brand-new ValidationRequest
   * — the previous REJECTED one is never touched, so it and its comment stay
   * fully visible in history.
   */
  async resubmit(id: string, submittedById: string, comment?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await this.findTransaction(id, tx);
      if (transaction.expenseWorkflowStatus !== 'REJECTED') {
        throw new ConflictException(
          `Transition impossible de "${transaction.expenseWorkflowStatus ?? 'NULL'}" vers "PENDING_APPROVAL".`,
        );
      }
      await this.atomicWrite(tx, id, 'REJECTED', 'PENDING_APPROVAL');
      await this.validationsService.create(
        {
          resourceType: 'EXPENSE_TRANSACTION',
          resourceId: id,
          submittedById,
          comment,
        },
        tx,
      );
      return tx.transaction.findUniqueOrThrow({
        where: { id },
        include: EXPENSE_INCLUDE,
      });
    });

    // PR 5D: only reached once the transaction above has committed.
    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'VALIDATION_SUBMITTED',
      resourceType: 'EXPENSE_TRANSACTION',
      resourceId: id,
      title: 'Dépense soumise à nouveau',
      message: this.describeExpense(
        result,
        'a été soumise à nouveau pour validation',
      ),
    });

    return result;
  }

  /** APPROVED → COMPLETED. Director-side lifecycle action; no ValidationRequest. */
  async complete(id: string) {
    const result = await this.performTransition(id, 'COMPLETED');
    // PR 5D: performTransition() throws before this line on any invalid
    // transition, so a failed complete() never notifies.
    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'EXPENSE_COMPLETED',
      resourceType: 'EXPENSE_TRANSACTION',
      resourceId: id,
      title: 'Dépense clôturée',
      message: this.describeExpense(result, 'a été clôturée'),
    });
    return result;
  }

  /** APPROVED → CANCELLED. Director-side lifecycle action; no ValidationRequest. */
  async cancel(id: string) {
    const result = await this.performTransition(id, 'CANCELLED');
    await this.notificationsService.createForRole('SUPERVISOR', {
      type: 'EXPENSE_CANCELLED',
      resourceType: 'EXPENSE_TRANSACTION',
      resourceId: id,
      title: 'Dépense annulée',
      message: this.describeExpense(result, 'a été annulée'),
    });
    return result;
  }
}
