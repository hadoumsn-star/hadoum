import {
  resolveDashboardPeriod,
  toFinanceYearMonth,
  DEFAULT_DASHBOARD_PERIOD,
} from './dashboard-period.util';

describe('resolveDashboardPeriod', () => {
  // Wednesday, 19 August 2026, 14:30 UTC — a mid-week, mid-month,
  // mid-quarter anchor so every boundary test below is unambiguous.
  const NOW = new Date('2026-08-19T14:30:00.000Z');

  it('defaults to month when no period type is given', () => {
    const period = resolveDashboardPeriod(undefined, NOW);
    expect(period.type).toBe('month');
    expect(period.type).toBe(DEFAULT_DASHBOARD_PERIOD);
  });

  it('defaults to month for an unrecognized period string', () => {
    const period = resolveDashboardPeriod('not-a-real-period', NOW);
    expect(period.type).toBe('month');
  });

  it('today: the current UTC calendar day only, [start, end) exactly 24h apart', () => {
    const period = resolveDashboardPeriod('today', NOW);
    expect(period.start.toISOString()).toBe('2026-08-19T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(period.end.getTime() - period.start.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it('today: NOW itself falls inside [start, end)', () => {
    const period = resolveDashboardPeriod('today', NOW);
    expect(NOW.getTime() >= period.start.getTime()).toBe(true);
    expect(NOW.getTime() < period.end.getTime()).toBe(true);
  });

  it('week: ISO week (Monday–Sunday) — 19 Aug 2026 is a Wednesday, so week starts Mon 17 Aug', () => {
    const period = resolveDashboardPeriod('week', NOW);
    expect(period.start.toISOString()).toBe('2026-08-17T00:00:00.000Z'); // Monday
    expect(period.end.toISOString()).toBe('2026-08-24T00:00:00.000Z'); // next Monday
    expect(period.end.getTime() - period.start.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it('week: a Sunday anchor still resolves to the Monday of the same ISO week (not the next one)', () => {
    // 23 Aug 2026 is a Sunday, still within the same ISO week as 17–23 Aug.
    const sunday = new Date('2026-08-23T23:59:59.000Z');
    const period = resolveDashboardPeriod('week', sunday);
    expect(period.start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('week: a Monday anchor resolves to itself as the start', () => {
    const monday = new Date('2026-08-17T00:00:00.001Z');
    const period = resolveDashboardPeriod('week', monday);
    expect(period.start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('month: the full calendar month, correctly spanning a 31-day month', () => {
    const period = resolveDashboardPeriod('month', NOW);
    expect(period.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('month: December correctly rolls over into next January (year boundary)', () => {
    const december = new Date('2026-12-15T00:00:00.000Z');
    const period = resolveDashboardPeriod('month', december);
    expect(period.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('month: February in a leap year ends on the 29th (never hardcodes days-in-month)', () => {
    // 2028 is a leap year.
    const leapFeb = new Date('2028-02-10T00:00:00.000Z');
    const period = resolveDashboardPeriod('month', leapFeb);
    expect(period.start.toISOString()).toBe('2028-02-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });

  it('quarter: August falls in Q3 (Jul–Sep)', () => {
    const period = resolveDashboardPeriod('quarter', NOW);
    expect(period.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('quarter: Q4 correctly rolls over into next January (year boundary)', () => {
    const november = new Date('2026-11-05T00:00:00.000Z');
    const period = resolveDashboardPeriod('quarter', november);
    expect(period.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('quarter: Q1 (Jan–Mar) resolves correctly', () => {
    const january = new Date('2026-01-15T00:00:00.000Z');
    const period = resolveDashboardPeriod('quarter', january);
    expect(period.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('year: the full calendar year', () => {
    const period = resolveDashboardPeriod('year', NOW);
    expect(period.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('every period type produces a half-open range where start < end', () => {
    for (const type of ['today', 'week', 'month', 'quarter', 'year'] as const) {
      const period = resolveDashboardPeriod(type, NOW);
      expect(period.start.getTime()).toBeLessThan(period.end.getTime());
    }
  });
});

describe('toFinanceYearMonth', () => {
  it('derives the calendar month containing the period start (month period)', () => {
    const period = resolveDashboardPeriod(
      'month',
      new Date('2026-08-19T00:00:00.000Z'),
    );
    expect(toFinanceYearMonth(period)).toEqual({ year: 2026, month: 8 });
  });

  it("derives the *first* month of a quarter period (documented adapter — see the util's own comment)", () => {
    const period = resolveDashboardPeriod(
      'quarter',
      new Date('2026-08-19T00:00:00.000Z'),
    );
    expect(toFinanceYearMonth(period)).toEqual({ year: 2026, month: 7 }); // Q3 starts in July
  });

  it('derives January for a year period', () => {
    const period = resolveDashboardPeriod(
      'year',
      new Date('2026-08-19T00:00:00.000Z'),
    );
    expect(toFinanceYearMonth(period)).toEqual({ year: 2026, month: 1 });
  });

  it('correctly derives December of the prior year for an early-January "week" period spanning the year boundary', () => {
    // 1 Jan 2026 is a Thursday; its ISO week starts Monday 29 Dec 2025.
    const period = resolveDashboardPeriod(
      'week',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2025-12-29T00:00:00.000Z');
    expect(toFinanceYearMonth(period)).toEqual({ year: 2025, month: 12 });
  });
});
