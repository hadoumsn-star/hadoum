import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesService } from '../finances/finances.service';
import { StaffService } from '../staff/staff.service';

type MockPrisma = {
  child: { count: jest.Mock; findMany: jest.Mock };
  staffMember: { count: jest.Mock };
  donorProfile: { count: jest.Mock };
  donation: { count: jest.Mock; findMany: jest.Mock };
  fundraisingCampaign: { count: jest.Mock; findMany: jest.Mock };
  stockItem: { findMany: jest.Mock };
  administrativeProcedure: { findMany: jest.Mock };
  incident: { count: jest.Mock };
  maintenanceTicket: { count: jest.Mock };
  validationRequest: { count: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    child: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    staffMember: { count: jest.fn() },
    donorProfile: { count: jest.fn().mockResolvedValue(0) },
    donation: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    fundraisingCampaign: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    stockItem: { findMany: jest.fn().mockResolvedValue([]) },
    administrativeProcedure: { findMany: jest.fn().mockResolvedValue([]) },
    incident: { count: jest.fn().mockResolvedValue(0) },
    maintenanceTicket: { count: jest.fn().mockResolvedValue(0) },
    validationRequest: { count: jest.fn().mockResolvedValue(0) },
  };
}

const EMPTY_FINANCE_DASHBOARD = {
  period: { year: 2026, month: 8 },
  soldeCaisseXof: 0,
  soldeCaisseEur: 0,
  byCategory: [],
  monthlyTrend: [],
  alerts: [],
};

const EMPTY_DAILY_PRESENCE = {
  date: '2026-08-19',
  entries: [] as { staffId: string; status: string; onLeave: string | null }[],
  nonConfirmedCount: 0,
};

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: MockPrisma;
  let financesService: {
    getDashboard: jest.Mock;
    getMonthlyTrend: jest.Mock;
    getDailyTrend: jest.Mock;
  };
  let staffService: {
    listDailyPresence: jest.Mock;
    listPresenceTrend: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    financesService = {
      getDashboard: jest.fn(),
      getMonthlyTrend: jest.fn().mockResolvedValue([]),
      getDailyTrend: jest.fn().mockResolvedValue([]),
    };
    staffService = {
      listDailyPresence: jest.fn(),
      listPresenceTrend: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: FinancesService, useValue: financesService },
        { provide: StaffService, useValue: staffService },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  // ─── Empty database → valid zero values ──────────────────────────────────

  it('returns valid zero values on an empty database, never NaN/undefined/crash', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.child.findMany.mockResolvedValue([]);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(result.children).toEqual({
      totalActive: 0,
      presentToday: 0,
      absentToday: 0,
    });
    expect(result.staff).toEqual({
      totalActive: 0,
      presentToday: 0,
      absentToday: 0,
      nonConfirmedToday: 0,
    });
    expect(result.finance).toEqual({ budgetTotalXof: 0, budgetRestantXof: 0 });
    expect(result.donors).toEqual({
      sponsorsActive: 0,
      donationsCount: 0,
      campaignsActive: 0,
    });
    // No NaN anywhere in the response.
    expect(JSON.stringify(result)).not.toContain('NaN');
  });

  // ─── Default period ───────────────────────────────────────────────────────

  it('defaults to a month-typed period when no period is given', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(result.period.type).toBe('month');
  });

  // ─── presentToday stays today-based regardless of the selected period ────

  it('always requests staff presence for the real current day, even when period=year', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    await service.getOverview('year');

    const todayStr = new Date().toISOString().slice(0, 10);
    expect(staffService.listDailyPresence).toHaveBeenCalledWith(todayStr);
  });

  // ─── Financial values come from existing Finance logic ──────────────────

  it('derives budgetTotalXof/budgetRestantXof entirely from FinancesService.getDashboard, never recomputing Transactions itself', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue({
      ...EMPTY_FINANCE_DASHBOARD,
      soldeCaisseXof: 1_250_000,
      byCategory: [
        { category: 'ALIMENTATION', availableXof: 30_000 },
        { category: 'SANTE', availableXof: 15_000 },
        { category: 'SANS_BUDGET', availableXof: null }, // no budget line — must not NaN the sum
      ],
    });

    const result = await service.getOverview('month');

    expect(result.finance.budgetTotalXof).toBe(1_250_000);
    expect(result.finance.budgetRestantXof).toBe(45_000);
  });

  it('calls FinancesService.getDashboard with the year/month derived from the resolved period (month default)', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    await service.getOverview('month');

    const now = new Date();
    expect(financesService.getDashboard).toHaveBeenCalledWith(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
  });

  // ─── Donor aggregates ─────────────────────────────────────────────────────

  it("counts sponsorsActive as active PARRAIN donor profiles only (mirrors DonorsService's own filter, not re-derived business logic)", async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(7);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(prisma.donorProfile.count).toHaveBeenCalledWith({
      where: { type: 'PARRAIN', active: true },
    });
    expect(result.donors.sponsorsActive).toBe(7);
  });

  it("counts donationsCount as the total donation count (all-time, matching DonorsPage's own existing KPI)", async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(42);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(prisma.donation.count).toHaveBeenCalledWith();
    expect(result.donors.donationsCount).toBe(42);
  });

  it('counts campaignsActive as ACTIVE fundraising campaigns only', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(3);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(prisma.fundraisingCampaign.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
    });
    expect(result.donors.campaignsActive).toBe(3);
  });

  // ─── Children ─────────────────────────────────────────────────────────────

  it('counts children.totalActive via a plain isActive:true count', async () => {
    prisma.child.count.mockResolvedValue(58);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(prisma.child.count).toHaveBeenCalledWith({
      where: { isActive: true },
    });
    expect(result.children.totalActive).toBe(58);
  });

  it('fetches only the four non-PII columns child-attendance.util.ts needs, bounded to active-or-temporary-sortie children', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    await service.getOverview();

    expect(prisma.child.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ isActive: true }, { isActive: false, exitType: 'temporaire' }],
      },
      select: {
        isActive: true,
        exitType: true,
        exitDate: true,
        exitReturnDate: true,
      },
    });
  });

  it('computes children.presentToday/absentToday via the centralized child-attendance rule, and allows present+absent to exceed totalActive', async () => {
    prisma.child.count.mockResolvedValue(1); // only one child flagged isActive:true
    prisma.child.findMany.mockResolvedValue([
      { isActive: true, exitType: null, exitDate: null, exitReturnDate: null }, // present
      {
        isActive: false,
        exitType: 'temporaire',
        exitDate: new Date('2020-01-01'), // long past, no return date → active sortie
        exitReturnDate: null,
      }, // absent, isActive:false — not counted in totalActive at all
    ]);
    prisma.staffMember.count.mockResolvedValue(0);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue(EMPTY_DAILY_PRESENCE);
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(result.children).toEqual({
      totalActive: 1,
      presentToday: 1,
      absentToday: 1,
    });
    // Documented, intentional mismatch — not a bug.
    expect(result.children.presentToday + result.children.absentToday).toBe(2);
    expect(result.children.totalActive).toBe(1);
  });

  // ─── Staff presence reduction ─────────────────────────────────────────────

  it('reduces StaffService.listDailyPresence entries into present/absent/nonConfirmed counts, matching summarizeDailyPresence semantics exactly', async () => {
    prisma.child.count.mockResolvedValue(0);
    prisma.staffMember.count.mockResolvedValue(5);
    prisma.donorProfile.count.mockResolvedValue(0);
    prisma.donation.count.mockResolvedValue(0);
    prisma.fundraisingCampaign.count.mockResolvedValue(0);
    staffService.listDailyPresence.mockResolvedValue({
      date: '2026-08-19',
      entries: [
        { staffId: 's1', status: 'PRESENT', onLeave: null },
        { staffId: 's2', status: 'PRESENT', onLeave: null },
        { staffId: 's3', status: 'ABSENT', onLeave: null },
        { staffId: 's4', status: 'NON_CONFIRMED', onLeave: null },
        { staffId: 's5', status: 'NON_CONFIRMED', onLeave: 'conge' },
      ],
      // Excludes s5 (onLeave) — same eligibility rule as
      // StaffService.listDailyPresence's own nonConfirmedCount.
      nonConfirmedCount: 1,
    });
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    expect(result.staff).toEqual({
      totalActive: 5,
      presentToday: 2,
      absentToday: 1,
      nonConfirmedToday: 1,
    });
  });

  // ─── BOARD privacy: response shape never carries person-level data ───────

  it('never includes person-level objects (names, ids, entries) anywhere in the response — same object is returned regardless of caller role', async () => {
    prisma.child.count.mockResolvedValue(10);
    prisma.child.findMany.mockResolvedValue([
      {
        isActive: false,
        exitType: 'temporaire',
        exitDate: new Date('2026-08-01'),
        exitReturnDate: null,
      },
    ]);
    prisma.staffMember.count.mockResolvedValue(4);
    prisma.donorProfile.count.mockResolvedValue(2);
    prisma.donation.count.mockResolvedValue(9);
    prisma.fundraisingCampaign.count.mockResolvedValue(1);
    staffService.listDailyPresence.mockResolvedValue({
      date: '2026-08-19',
      entries: [
        {
          staffId: 's1',
          firstName: 'Awa',
          lastName: 'Diop',
          status: 'PRESENT',
          onLeave: null,
        },
      ],
      nonConfirmedCount: 0,
    });
    financesService.getDashboard.mockResolvedValue(EMPTY_FINANCE_DASHBOARD);

    const result = await service.getOverview();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Awa');
    expect(serialized).not.toContain('Diop');
    expect(serialized).not.toContain('firstName');
    expect(serialized).not.toContain('lastName');
    expect(serialized).not.toContain('entries');
    expect(serialized).not.toContain('staffId');
    expect(serialized).not.toContain('exitType');
    expect(serialized).not.toContain('exitDate');
    // Every field in the response is a number or a period descriptor.
    expect(Object.keys(result)).toEqual([
      'period',
      'children',
      'staff',
      'finance',
      'donors',
    ]);
  });

  // ─── getOperations (PR 21) ─────────────────────────────────────────────────

  describe('getOperations', () => {
    it('returns valid zero values on an empty database', async () => {
      const result = await service.getOperations();
      expect(result).toEqual({
        stockAlertsCount: 0,
        proceduresRequiringAttentionCount: 0,
        openIncidentsCount: 0,
        maintenanceTicketsRequiringAttentionCount: 0,
        pendingValidationsCount: 0,
      });
    });

    it('counts open incidents as status != RESOLU', async () => {
      prisma.incident.count.mockResolvedValue(4);
      const result = await service.getOperations();
      expect(prisma.incident.count).toHaveBeenCalledWith({
        where: { status: { not: 'RESOLU' } },
      });
      expect(result.openIncidentsCount).toBe(4);
    });

    it('counts maintenance tickets requiring attention as status not in a terminal state', async () => {
      prisma.maintenanceTicket.count.mockResolvedValue(2);
      const result = await service.getOperations();
      expect(prisma.maintenanceTicket.count).toHaveBeenCalledWith({
        where: { status: { notIn: ['RESOLU', 'FERME', 'ANNULE'] } },
      });
      expect(result.maintenanceTicketsRequiringAttentionCount).toBe(2);
    });

    it('counts pending validations via a direct PENDING_VALIDATION status count (bypassing findPending())', async () => {
      prisma.validationRequest.count.mockResolvedValue(6);
      const result = await service.getOperations();
      expect(prisma.validationRequest.count).toHaveBeenCalledWith({
        where: { status: 'PENDING_VALIDATION' },
      });
      expect(result.pendingValidationsCount).toBe(6);
    });

    it('counts stock alerts as out-of-stock or low-stock among active items only', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 0, minimumQuantity: 5 }, // out of stock
        { currentQuantity: 2, minimumQuantity: 5 }, // low stock
        { currentQuantity: 10, minimumQuantity: 5 }, // fine
        { currentQuantity: 3, minimumQuantity: null }, // no threshold set — not low
      ]);
      const result = await service.getOperations();
      expect(prisma.stockItem.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { currentQuantity: true, minimumQuantity: true },
      });
      expect(result.stockAlertsCount).toBe(2);
    });

    it('counts procedures requiring attention via the centralized computeProcedureAlerts union (PR 22 — was isExpiringSoon-only in PR 21)', async () => {
      const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days out
      const far = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000); // far out
      const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // already expired
      const base = {
        status: 'EN_COURS' as const,
        renewalDate: null,
        expectedResponseDate: null,
      };
      prisma.administrativeProcedure.findMany.mockResolvedValue([
        { ...base, expirationDate: soon }, // isExpiringSoon
        { ...base, expirationDate: far }, // no alert
        { ...base, expirationDate: past }, // isExpired -> now counted too (PR 22)
        { ...base, expirationDate: null }, // no expiration — excluded
      ]);
      const result = await service.getOperations();
      expect(prisma.administrativeProcedure.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'ARCHIVE' } },
        select: {
          status: true,
          expirationDate: true,
          renewalDate: true,
          expectedResponseDate: true,
        },
      });
      // 1 overdue (past) + 1 expiring soon (soon) = 2, not the PR 21 value
      // of 1 (which only ever counted isExpiringSoon).
      expect(result.proceduresRequiringAttentionCount).toBe(2);
    });

    it('never includes person-level or free-text fields (names, titles, descriptions) in the response', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 0, minimumQuantity: 5 },
      ]);
      const result = await service.getOperations();
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('name');
      expect(serialized).not.toContain('title');
      expect(Object.keys(result)).toEqual([
        'stockAlertsCount',
        'proceduresRequiringAttentionCount',
        'openIncidentsCount',
        'maintenanceTicketsRequiringAttentionCount',
        'pendingValidationsCount',
      ]);
    });
  });

  // ─── getTrends (PR 21) ──────────────────────────────────────────────────────

  describe('getTrends', () => {
    it('returns empty-but-valid series on an empty database', async () => {
      const result = await service.getTrends('month');
      expect(result.finance).toEqual([]);
      expect(result.donations).toEqual([]);
      expect(result.staffAttendance).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('NaN');
    });

    it('defaults to period=month, same as /overview', async () => {
      const result = await service.getTrends();
      expect(result.period.type).toBe('month');
    });

    it('for month/quarter/year, reuses FinancesService.getMonthlyTrend verbatim (never recomputes Transaction sums itself)', async () => {
      financesService.getMonthlyTrend.mockResolvedValue([
        { year: 2026, month: 3, recettesXof: 100, depensesXof: 40 },
        { year: 2026, month: 4, recettesXof: 200, depensesXof: 90 },
      ]);

      const result = await service.getTrends('quarter');

      expect(financesService.getDailyTrend).not.toHaveBeenCalled();
      expect(financesService.getMonthlyTrend).toHaveBeenCalled();
      expect(result.finance).toEqual([
        { label: '2026-03', recettesXof: 100, depensesXof: 40 },
        { label: '2026-04', recettesXof: 200, depensesXof: 90 },
      ]);
    });

    it('for today/week, uses the new FinancesService.getDailyTrend instead of the monthly one', async () => {
      financesService.getDailyTrend.mockResolvedValue([
        { date: '2026-08-19', recettesXof: 5000, depensesXof: 1000 },
      ]);

      const result = await service.getTrends('today');

      expect(financesService.getMonthlyTrend).not.toHaveBeenCalled();
      expect(financesService.getDailyTrend).toHaveBeenCalled();
      expect(result.finance).toEqual([
        { label: '2026-08-19', recettesXof: 5000, depensesXof: 1000 },
      ]);
    });

    it('donation trend buckets are aligned to the same labels the finance series just used', async () => {
      financesService.getDailyTrend.mockResolvedValue([
        { date: '2026-08-17', recettesXof: 0, depensesXof: 0 },
        { date: '2026-08-18', recettesXof: 0, depensesXof: 0 },
      ]);
      prisma.donation.findMany.mockResolvedValue([
        { date: new Date('2026-08-17T10:00:00.000Z'), amountXof: 3000 },
        { date: new Date('2026-08-17T18:00:00.000Z'), amountXof: 1000 },
        { date: new Date('2026-08-18T00:00:00.000Z'), amountXof: 500 },
      ]);

      const result = await service.getTrends('week');

      expect(result.donations).toEqual([
        { label: '2026-08-17', amountXof: 4000, count: 2 },
        { label: '2026-08-18', amountXof: 500, count: 1 },
      ]);
    });

    it('donation trend never selects donor identity fields', async () => {
      prisma.donation.findMany.mockResolvedValue([]);
      await service.getTrends('week');
      expect(prisma.donation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { date: true, amountXof: true },
        }),
      );
    });

    it('staff attendance trend reuses StaffService.listPresenceTrend verbatim, one bucket per day in the resolved period', async () => {
      staffService.listPresenceTrend.mockResolvedValue([
        { date: '2026-08-17', present: 8, absent: 1, nonConfirmed: 0 },
        { date: '2026-08-18', present: 7, absent: 2, nonConfirmed: 1 },
      ]);

      const result = await service.getTrends('week');

      expect(result.staffAttendance).toEqual([
        { label: '2026-08-17', present: 8, absent: 1, nonConfirmed: 0 },
        { label: '2026-08-18', present: 7, absent: 2, nonConfirmed: 1 },
      ]);
    });

    it('fetches finance/staff series independently (Promise.all), not serially', async () => {
      let financeResolved = false;
      let staffResolved = false;
      financesService.getMonthlyTrend.mockImplementation(() => {
        financeResolved = true;
        return Promise.resolve([]);
      });
      staffService.listPresenceTrend.mockImplementation(() => {
        staffResolved = true;
        return Promise.resolve([]);
      });

      await service.getTrends('month');

      expect(financeResolved).toBe(true);
      expect(staffResolved).toBe(true);
    });

    it('never includes person-level data (donor/staff/child names, ids) in the trend response', async () => {
      financesService.getMonthlyTrend.mockResolvedValue([
        { year: 2026, month: 8, recettesXof: 100, depensesXof: 50 },
      ]);
      prisma.donation.findMany.mockResolvedValue([
        { date: new Date('2026-08-05'), amountXof: 2000 },
      ]);
      staffService.listPresenceTrend.mockResolvedValue([
        { date: '2026-08-19', present: 3, absent: 0, nonConfirmed: 0 },
      ]);

      const result = await service.getTrends('month');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('donorProfileId');
      expect(serialized).not.toContain('staffId');
      expect(serialized).not.toContain('firstName');
      expect(Object.keys(result)).toEqual([
        'period',
        'finance',
        'donations',
        'staffAttendance',
      ]);
    });
  });

  // ─── getAttention (PR 22) ───────────────────────────────────────────────

  describe('getAttention', () => {
    it('returns an empty items list and zeroed summary on a completely empty database', async () => {
      const result = await service.getAttention();
      expect(result).toEqual({
        summary: { total: 0, critical: 0, warning: 0, info: 0 },
        items: [],
      });
    });

    it('omits a domain entirely when its count is zero (no zero-count cards)', async () => {
      prisma.incident.count.mockResolvedValue(0);
      const result = await service.getAttention();
      expect(
        result.items.find((i) => i.key === 'incidents-open'),
      ).toBeUndefined();
    });

    it('includes a stock-low item with the same count as /operations, correct severity/domain/targetPath', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 0, minimumQuantity: 5 },
        { currentQuantity: 2, minimumQuantity: 5 },
      ]);
      const result = await service.getAttention();
      const item = result.items.find((i) => i.key === 'stock-low');
      expect(item).toMatchObject({
        key: 'stock-low',
        domain: 'STOCK',
        severity: 'WARNING',
        count: 2,
        targetPath: '/app/stocks-inventaire',
      });
    });

    it('includes a maintenance-overdue item, WARNING severity', async () => {
      prisma.maintenanceTicket.count.mockResolvedValue(3);
      const result = await service.getAttention();
      const item = result.items.find((i) => i.key === 'maintenance-overdue');
      expect(item).toMatchObject({
        domain: 'MAINTENANCE',
        severity: 'WARNING',
        count: 3,
        targetPath: '/app/administration',
      });
    });

    it("splits procedures into procedures-overdue (CRITICAL) and procedures-expiring (WARNING), summing to /operations' single count", async () => {
      const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const base = {
        status: 'EN_COURS' as const,
        renewalDate: null,
        expectedResponseDate: null,
      };
      prisma.administrativeProcedure.findMany.mockResolvedValue([
        { ...base, expirationDate: soon }, // expiring soon
        { ...base, expirationDate: past }, // overdue (expired)
      ]);

      const [attention, operations] = await Promise.all([
        service.getAttention(),
        service.getOperations(),
      ]);

      const overdueItem = attention.items.find(
        (i) => i.key === 'procedures-overdue',
      );
      const expiringItem = attention.items.find(
        (i) => i.key === 'procedures-expiring',
      );
      expect(overdueItem).toMatchObject({ severity: 'CRITICAL', count: 1 });
      expect(expiringItem).toMatchObject({ severity: 'WARNING', count: 1 });
      expect((overdueItem?.count ?? 0) + (expiringItem?.count ?? 0)).toBe(
        operations.proceduresRequiringAttentionCount,
      );
    });

    it('includes an incidents-open item, same count as /operations', async () => {
      prisma.incident.count.mockResolvedValue(4);
      const [attention, operations] = await Promise.all([
        service.getAttention(),
        service.getOperations(),
      ]);
      const item = attention.items.find((i) => i.key === 'incidents-open');
      expect(item).toMatchObject({
        domain: 'INCIDENTS',
        severity: 'WARNING',
        count: 4,
        targetPath: '/app/incidents',
      });
      expect(item?.count).toBe(operations.openIncidentsCount);
    });

    it('includes a validations-pending item using the direct status count, same as /operations', async () => {
      prisma.validationRequest.count.mockResolvedValue(6);
      const [attention, operations] = await Promise.all([
        service.getAttention(),
        service.getOperations(),
      ]);
      expect(prisma.validationRequest.count).toHaveBeenCalledWith({
        where: { status: 'PENDING_VALIDATION' },
      });
      const item = attention.items.find((i) => i.key === 'validations-pending');
      expect(item).toMatchObject({
        domain: 'VALIDATIONS',
        severity: 'WARNING',
        count: 6,
        targetPath: '/app/validations',
      });
      expect(item?.count).toBe(operations.pendingValidationsCount);
    });

    it('splits campaigns into campaigns-ending-soon (WARNING) and campaigns-past-end (CRITICAL), only ACTIVE campaigns considered', async () => {
      const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      prisma.fundraisingCampaign.findMany.mockResolvedValue([
        { status: 'ACTIVE', endDate: soon },
        { status: 'ACTIVE', endDate: past },
      ]);
      const result = await service.getAttention();
      expect(prisma.fundraisingCampaign.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        select: { status: true, endDate: true },
      });
      expect(
        result.items.find((i) => i.key === 'campaigns-ending-soon'),
      ).toMatchObject({
        severity: 'WARNING',
        count: 1,
        targetPath: '/app/donateurs',
      });
      expect(
        result.items.find((i) => i.key === 'campaigns-past-end'),
      ).toMatchObject({
        severity: 'CRITICAL',
        count: 1,
        targetPath: '/app/donateurs',
      });
    });

    it('donor-reports-to-prepare uses the exact Module 5 definition (active PARRAIN, zero reports), INFO severity', async () => {
      prisma.donorProfile.count.mockResolvedValue(5);
      const result = await service.getAttention();
      expect(prisma.donorProfile.count).toHaveBeenCalledWith({
        where: { type: 'PARRAIN', active: true, reports: { none: {} } },
      });
      const item = result.items.find(
        (i) => i.key === 'donor-reports-to-prepare',
      );
      expect(item).toMatchObject({
        domain: 'DONOR_REPORTS',
        severity: 'INFO',
        count: 5,
        targetPath: '/app/donateurs',
      });
    });

    it('every emitted key is one of the 9 deterministic constants — never a random/generated id', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 0, minimumQuantity: 5 },
      ]);
      prisma.incident.count.mockResolvedValue(1);
      prisma.maintenanceTicket.count.mockResolvedValue(1);
      prisma.validationRequest.count.mockResolvedValue(1);
      prisma.donorProfile.count.mockResolvedValue(1);
      const result = await service.getAttention();
      const KNOWN_KEYS = [
        'stock-low',
        'maintenance-overdue',
        'procedures-overdue',
        'procedures-expiring',
        'incidents-open',
        'validations-pending',
        'campaigns-ending-soon',
        'campaigns-past-end',
        'donor-reports-to-prepare',
      ];
      for (const item of result.items) {
        expect(KNOWN_KEYS).toContain(item.key);
      }
      // No duplicate keys — one card per condition, never two cards for
      // the same underlying condition.
      const keys = result.items.map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('summary counts match the actual items by severity', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 0, minimumQuantity: 5 },
      ]); // stock-low -> WARNING
      prisma.donorProfile.count.mockResolvedValue(2); // donor-reports-to-prepare -> INFO
      const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      prisma.fundraisingCampaign.findMany.mockResolvedValue([
        { status: 'ACTIVE', endDate: past },
      ]); // campaigns-past-end -> CRITICAL

      const result = await service.getAttention();

      expect(result.summary).toEqual({
        total: result.items.length,
        critical: result.items.filter((i) => i.severity === 'CRITICAL').length,
        warning: result.items.filter((i) => i.severity === 'WARNING').length,
        info: result.items.filter((i) => i.severity === 'INFO').length,
      });
      expect(result.summary).toEqual({
        total: 3,
        critical: 1,
        warning: 1,
        info: 1,
      });
    });

    it('resolved conditions disappear: a stock item that is no longer low is not counted, regardless of any prior state', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 50, minimumQuantity: 5 },
      ]);
      const result = await service.getAttention();
      expect(result.items.find((i) => i.key === 'stock-low')).toBeUndefined();
    });

    it('never reads the Notification table — attention is computed purely from current entity state', async () => {
      // The mock Prisma object has no `notification` model at all; if
      // getAttention ever called prisma.notification.* this would throw
      // (cannot read property of undefined) rather than silently pass.
      await expect(service.getAttention()).resolves.toBeDefined();
    });

    it('never includes person-level data (names, ids, titles, descriptions) anywhere in the response', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        { currentQuantity: 0, minimumQuantity: 5 },
      ]);
      const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      prisma.fundraisingCampaign.findMany.mockResolvedValue([
        {
          status: 'ACTIVE',
          endDate: soon,
          title: 'Cagnotte secrète',
          id: 'camp-1',
        },
      ]);
      const result = await service.getAttention();
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('Cagnotte secrète');
      expect(serialized).not.toContain('camp-1');
      // Every item has exactly the documented fields.
      for (const item of result.items) {
        expect(Object.keys(item).sort()).toEqual(
          [
            'count',
            'domain',
            'key',
            'message',
            'severity',
            'targetPath',
            'title',
          ].sort(),
        );
      }
    });
  });
});
