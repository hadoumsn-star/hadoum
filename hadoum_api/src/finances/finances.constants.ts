import { TransactionCategory } from '@prisma/client';

export const XOF_PER_EUR = 655.957;

export function xofToEur(amountXof: number): number {
  return Math.round((amountXof / XOF_PER_EUR) * 100) / 100;
}

// PR 6 — the organization's standing monthly budget, seeded idempotently
// (create-only, never overwrites — see FinancesService.ensureDefaultBudgetLines).
// SALAIRES is intentionally 0 "for now" per the product request, not omitted:
// a real BudgetLine row exists so the dashboard's zero-budget handling
// (available = -committed, percentages null instead of dividing by zero)
// is exercised rather than just falling back to "no budget defined".
export const DEFAULT_BUDGET_CATEGORIES: {
  category: TransactionCategory;
  budgetXof: number;
}[] = [
  { category: 'ALIMENTATION', budgetXof: 250_000 },
  { category: 'SANTE', budgetXof: 36_000 },
  { category: 'VETEMENTS', budgetXof: 20_000 },
  { category: 'TRANSPORT', budgetXof: 18_000 },
  { category: 'ETUDES', budgetXof: 10_000 },
  { category: 'SPORT', budgetXof: 30_000 },
  { category: 'LOISIRS', budgetXof: 30_000 },
  { category: 'BUREAU_FACTURES', budgetXof: 20_000 },
  { category: 'SALAIRES', budgetXof: 0 },
];
