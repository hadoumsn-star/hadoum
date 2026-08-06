import { Injectable } from '@nestjs/common';
import { Prisma, TransactionCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// PR 5C: budget reservation and consumption. Everything here is *derived*
// from Transaction rows + BudgetLine.budgetXof — no mutable counters are
// stored anywhere, so there is nothing to keep in sync or backfill.
//
// Definitions (see the PR 5C final report for the full rationale):
//   reservedXof = sum(amountXof) of DEPENSE transactions currently
//                 APPROVED (approved, not yet completed/cancelled).
//   consumedXof = sum(amountXof) of DEPENSE transactions COMPLETED
//                 (workflow-tracked) + sum(amountXof) of DEPENSE
//                 transactions with expenseWorkflowStatus = NULL and
//                 status = VALIDE (legacy "realized" rows, which predate
//                 the workflow and must keep counting as spent — this is
//                 the exact same predicate the pre-existing `realizedXof`
//                 dashboard field already uses, just further split off
//                 from the NULL-workflow rows only, so a COMPLETED
//                 workflow row is never counted twice).
// Both are always scoped to one TransactionCategory + one calendar month
// (transaction.date, not any workflow timestamp — see PR 5C section 14).

type Db = Prisma.TransactionClient;

export interface CategoryAvailability {
  reservedXof: number;
  consumedXof: number;
}

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  monthRange(year: number, month: number) {
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }

  /**
   * Row-level lock on the matching BudgetLine — the concurrency anchor for
   * approval-time reservation (PR 5C section 6). Must be called inside the
   * caller's `prisma.$transaction`. A second concurrent approval for the
   * same category/month/year blocks here until the first commits or rolls
   * back, then re-reads the (now up to date) row — so its own availability
   * calculation right after this call is always consistent. Different
   * categories/months use different BudgetLine rows, so this never blocks
   * unrelated approvals. Returns null if no BudgetLine exists (nothing to
   * lock — see the NO_BUDGET_LINE error path in ExpenseWorkflowService).
   */
  async lockBudgetLine(
    tx: Db,
    category: TransactionCategory,
    month: number,
    year: number,
  ): Promise<{ id: string; budgetXof: number } | null> {
    const rows = await tx.$queryRaw<{ id: string; budgetXof: number }[]>`
      SELECT "id", "budgetXof" FROM "BudgetLine"
      WHERE "category" = ${category}::"TransactionCategory"
        AND "month" = ${month}
        AND "year" = ${year}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Reserved + consumed for one category/month, read through `tx` so it
   * sees the same locked, consistent snapshot as the caller (used by the
   * approval-time check right after lockBudgetLine above).
   */
  async getCategoryAvailability(
    tx: Db,
    category: TransactionCategory,
    month: number,
    year: number,
  ): Promise<CategoryAvailability> {
    const { gte, lt } = this.monthRange(year, month);
    const [reserved, completed, legacyRealized] = await Promise.all([
      tx.transaction.aggregate({
        _sum: { amountXof: true },
        where: {
          type: 'DEPENSE',
          category,
          date: { gte, lt },
          expenseWorkflowStatus: 'APPROVED',
        },
      }),
      tx.transaction.aggregate({
        _sum: { amountXof: true },
        where: {
          type: 'DEPENSE',
          category,
          date: { gte, lt },
          expenseWorkflowStatus: 'COMPLETED',
        },
      }),
      tx.transaction.aggregate({
        _sum: { amountXof: true },
        where: {
          type: 'DEPENSE',
          category,
          date: { gte, lt },
          expenseWorkflowStatus: null,
          status: 'VALIDE',
        },
      }),
    ]);
    return {
      reservedXof: reserved._sum.amountXof ?? 0,
      consumedXof:
        (completed._sum.amountXof ?? 0) + (legacyRealized._sum.amountXof ?? 0),
    };
  }

  /**
   * Reserved + consumed for every category in one month, grouped — the
   * dashboard's read path (no lock: reporting only, mirrors the existing
   * groupBy(['category']) pattern already used for realizedXof).
   */
  async getAllCategoriesAvailability(
    year: number,
    month: number,
  ): Promise<Map<TransactionCategory, CategoryAvailability>> {
    const { gte, lt } = this.monthRange(year, month);
    const [reservedRows, completedRows, legacyRows] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['category'],
        _sum: { amountXof: true },
        where: {
          type: 'DEPENSE',
          date: { gte, lt },
          expenseWorkflowStatus: 'APPROVED',
        },
      }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        _sum: { amountXof: true },
        where: {
          type: 'DEPENSE',
          date: { gte, lt },
          expenseWorkflowStatus: 'COMPLETED',
        },
      }),
      this.prisma.transaction.groupBy({
        by: ['category'],
        _sum: { amountXof: true },
        where: {
          type: 'DEPENSE',
          date: { gte, lt },
          expenseWorkflowStatus: null,
          status: 'VALIDE',
        },
      }),
    ]);

    const result = new Map<TransactionCategory, CategoryAvailability>();
    const ensure = (category: TransactionCategory) => {
      let entry = result.get(category);
      if (!entry) {
        entry = { reservedXof: 0, consumedXof: 0 };
        result.set(category, entry);
      }
      return entry;
    };
    for (const row of reservedRows) {
      ensure(row.category).reservedXof += row._sum.amountXof ?? 0;
    }
    for (const row of completedRows) {
      ensure(row.category).consumedXof += row._sum.amountXof ?? 0;
    }
    for (const row of legacyRows) {
      ensure(row.category).consumedXof += row._sum.amountXof ?? 0;
    }
    return result;
  }
}
