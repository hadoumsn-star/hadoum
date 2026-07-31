import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TransactionType,
  TransactionCategory,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpsertBudgetLineDto } from './dto/upsert-budget-line.dto';
import { xofToEur } from './finances.constants';

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
  ) {}

  // ─── Transactions ────────────────────────────────────────────────────────

  createTransaction(dto: CreateTransactionDto) {
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
      },
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
      orderBy: { date: 'desc' },
    });
  }

  async findOneTransaction(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async updateTransaction(id: string, dto: UpdateTransactionDto) {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
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
      },
    });
  }

  async uploadJustificatif(id: string, file: Express.Multer.File) {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    if (existing.justifKey) await this.uploadService.deleteFile(existing.justifKey);
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
    const url = await this.uploadService.getPresignedUrl(
      transaction.justifKey,
    );
    return { url, expiresIn: 900 };
  }

  async deleteTransaction(id: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.justifKey)
      await this.uploadService.deleteFile(transaction.justifKey);
    await this.prisma.transaction.delete({ where: { id } });
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

  // ─── Dashboard ───────────────────────────────────────────────────────────

  async getDashboard(year: number, month: number) {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const [recettesValidees, depensesValidees] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amountXof: true },
        where: { type: TransactionType.RECETTE, status: TransactionStatus.VALIDE },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amountXof: true },
        where: { type: TransactionType.DEPENSE, status: TransactionStatus.VALIDE },
      }),
    ]);
    const soldeCaisseXof =
      (recettesValidees._sum.amountXof ?? 0) -
      (depensesValidees._sum.amountXof ?? 0);

    const [byCategoryRaw, budgetLines] = await Promise.all([
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
    ]);

    const byCategory = Array.from(categories).map((category) => {
      const realizedXof = realizedByCategory.get(category) ?? 0;
      const budgetXof = budgetByCategory.get(category) ?? null;
      const ecartXof = budgetXof !== null ? budgetXof - realizedXof : null;
      return {
        category,
        realizedXof,
        realizedEur: xofToEur(realizedXof),
        budgetXof,
        ecartXof,
        overBudget: budgetXof !== null && realizedXof > budgetXof,
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
