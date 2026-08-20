// Module 6 (PR 20) — one shared, pure, server-side period-resolution
// helper. Every dashboard aggregation method must call this rather than
// computing its own date window — see DashboardService.
//
// UTC throughout, matching FinancesService.getDashboard's own convention
// (`Date.UTC(...)`), so a "day" boundary here can never drift from a
// "day" boundary in the Finance aggregates this module calls into.
//
// Returns a deterministic half-open [start, end) range: `start` is
// inclusive, `end` is exclusive. Every consumer should filter with
// `date >= start && date < end` (Prisma: `{ gte: start, lt: end }`) —
// never `lte`, which would double-count the first instant of the next
// period on a value stored with time-of-day precision.

export type DashboardPeriodType =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

export const DASHBOARD_PERIOD_TYPES: readonly DashboardPeriodType[] = [
  'today',
  'week',
  'month',
  'quarter',
  'year',
];

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodType = 'month';

export interface ResolvedDashboardPeriod {
  type: DashboardPeriodType;
  start: Date;
  end: Date;
}

function isValidPeriodType(value: unknown): value is DashboardPeriodType {
  return (
    typeof value === 'string' &&
    (DASHBOARD_PERIOD_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Resolves a requested period type (or the default) to a concrete,
 * deterministic UTC date range, anchored on `now` (defaults to the real
 * current time — the parameter exists purely so tests can pin "today").
 *
 * - today: the current UTC calendar day.
 * - week: ISO 8601 week (Monday 00:00:00 UTC through the following
 *   Monday, exclusive) — there is no pre-existing "week" convention
 *   elsewhere in the codebase to defer to, so ISO week was chosen as the
 *   unambiguous, internationally standard definition.
 * - month: the current UTC calendar month — matches
 *   FinancesService.getDashboard's own month window exactly.
 * - quarter: the current UTC calendar quarter (Jan–Mar, Apr–Jun,
 *   Jul–Sep, Oct–Dec).
 * - year: the current UTC calendar year.
 *
 * An unrecognized/omitted period type silently falls back to the default
 * ('month') here — in practice this never happens through the HTTP layer
 * because DashboardOverviewQueryDto's `@IsIn(...)` already rejects an
 * invalid `?period=` value with a 400 before this function ever runs;
 * the fallback exists so this function stays safe to call directly
 * (e.g. from a test, or a future non-HTTP caller) without first
 * re-deriving that same validation.
 */
export function resolveDashboardPeriod(
  periodType?: string,
  now: Date = new Date(),
): ResolvedDashboardPeriod {
  const type = isValidPeriodType(periodType)
    ? periodType
    : DEFAULT_DASHBOARD_PERIOD;

  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (type) {
    case 'today': {
      const start = new Date(Date.UTC(y, m, d));
      const end = new Date(Date.UTC(y, m, d + 1));
      return { type, start, end };
    }

    case 'week': {
      // getUTCDay(): 0=Sunday..6=Saturday. ISO week starts Monday.
      const dayOfWeek = now.getUTCDay();
      const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // 1=Mon..7=Sun
      const mondayOffset = isoDayOfWeek - 1;
      const start = new Date(Date.UTC(y, m, d - mondayOffset));
      const end = new Date(Date.UTC(y, m, d - mondayOffset + 7));
      return { type, start, end };
    }

    case 'month': {
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 1));
      return { type, start, end };
    }

    case 'quarter': {
      const quarterStartMonth = Math.floor(m / 3) * 3;
      const start = new Date(Date.UTC(y, quarterStartMonth, 1));
      const end = new Date(Date.UTC(y, quarterStartMonth + 3, 1));
      return { type, start, end };
    }

    case 'year': {
      const start = new Date(Date.UTC(y, 0, 1));
      const end = new Date(Date.UTC(y + 1, 0, 1));
      return { type, start, end };
    }
  }
}

/**
 * FinancesService.getDashboard(year, month) is inherently month-granular
 * (BudgetLine itself is modeled per {year, month} — see FinancesService's
 * own comment) — there is no week/quarter/year variant to call into, and
 * PR 20's explicit instruction is to reuse Finance's existing calculation
 * rather than recreate it. For period=month (the default) this is exact.
 * For any other period type, the calendar month containing the resolved
 * period's `start` is used — e.g. period=quarter resolves Finance figures
 * for the quarter's *first* month, not the whole quarter. This is a
 * deliberate, documented adapter, not a silent inaccuracy: budgetTotalXof
 * (the approved "Budget Total" = soldeCaisseXof) is actually period-
 * independent anyway (it's an all-time balance, not month-scoped — see
 * FinancesService.getDashboard's own aggregate, which carries no date
 * filter), so only budgetRestantXof is affected by this adapter, and only
 * for a non-default period selection.
 */
export function toFinanceYearMonth(period: ResolvedDashboardPeriod): {
  year: number;
  month: number;
} {
  return {
    year: period.start.getUTCFullYear(),
    month: period.start.getUTCMonth() + 1,
  };
}
