import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesService } from '../finances/finances.service';
import { StaffService } from '../staff/staff.service';
import {
  resolveDashboardPeriod,
  toFinanceYearMonth,
} from './dashboard-period.util';
import type { ResolvedDashboardPeriod } from './dashboard-period.util';
import {
  summarizeChildAttendance,
  ChildAttendanceInput,
} from '../children/child-attendance.util';
import { computeProcedureAlerts } from '../administrative-procedures/administrative-procedure-alerts.util';
import { computeCampaignAlerts } from '../donors/campaign-alerts.util';

export interface DashboardOperationsResponse {
  stockAlertsCount: number;
  proceduresRequiringAttentionCount: number;
  openIncidentsCount: number;
  maintenanceTicketsRequiringAttentionCount: number;
  pendingValidationsCount: number;
}

// Module 6 (PR 22) — GET /dashboard/attention.

export type DashboardAttentionSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface DashboardAttentionItem {
  key: string;
  domain: string;
  severity: DashboardAttentionSeverity;
  title: string;
  message: string;
  count: number;
  targetPath: string;
}

export interface DashboardAttentionResponse {
  summary: { total: number; critical: number; warning: number; info: number };
  items: DashboardAttentionItem[];
}

// One centralized severity mapping for every attention key this module can
// ever emit — the only place CRITICAL/WARNING/INFO is decided. Keyed by the
// same deterministic key each item is built with (see getAttention below),
// so severity can never be scattered across per-branch ternaries.
//   CRITICAL — an overdue/past-end condition needing immediate action.
//   WARNING  — ending soon / low stock / pending operational work.
//   INFO     — a lower-urgency actionable reminder.
const ATTENTION_SEVERITY: Record<string, DashboardAttentionSeverity> = {
  'stock-low': 'WARNING',
  'maintenance-overdue': 'WARNING',
  'procedures-overdue': 'CRITICAL',
  'procedures-expiring': 'WARNING',
  'incidents-open': 'WARNING',
  'validations-pending': 'WARNING',
  'campaigns-ending-soon': 'WARNING',
  'campaigns-past-end': 'CRITICAL',
  'donor-reports-to-prepare': 'INFO',
};

export interface DashboardTrendsResponse {
  period: { type: string; start: string; end: string };
  finance: { label: string; recettesXof: number; depensesXof: number }[];
  donations: { label: string; amountXof: number; count: number }[];
  staffAttendance: {
    label: string;
    present: number;
    absent: number;
    nonConfirmed: number;
  }[];
}

export interface DashboardOverviewResponse {
  period: { type: string; start: string; end: string };
  children: { totalActive: number; presentToday: number; absentToday: number };
  staff: {
    totalActive: number;
    presentToday: number;
    absentToday: number;
    nonConfirmedToday: number;
  };
  finance: { budgetTotalXof: number; budgetRestantXof: number };
  donors: {
    sponsorsActive: number;
    donationsCount: number;
    campaignsActive: number;
  };
}

/**
 * Module 6 (PR 20) — the dashboard aggregation foundation.
 *
 * Architecture rule this class exists to honor: aggregate existing
 * domain services and/or run efficient Prisma count()/aggregate()/
 * groupBy() queries — never re-derive a business rule that already has
 * an authoritative implementation elsewhere, and never call out over
 * HTTP to this API's own controllers.
 *
 * Per-domain sourcing (see the final PR 20 report for the full audit):
 *  - finance: FinancesService.getDashboard() (unchanged) — budgetTotalXof
 *    is its soldeCaisseXof (the approved "Budget Total" definition),
 *    budgetRestantXof is the sum of its own per-category availableXof.
 *  - staff: StaffService.listDailyPresence() (unchanged) for
 *    present/absent/non-confirmed — the exact same reduction
 *    team.api.ts's summarizeDailyPresence performs on the frontend today,
 *    just run server-side; plus a plain StaffMember count for
 *    totalActive (the table only ever holds current staff — departure
 *    moves a row to FormerStaffMember, see StaffService.exitStaff).
 *  - children: totalActive is a direct `isActive: true` count.
 *    presentToday/absentToday (PR 21) reuse the centralized
 *    child-attendance.util.ts port of the frontend's present/absent
 *    business rule — see getOverview()'s own doc comment for the exact
 *    population fetched and why present+absent can differ from
 *    totalActive.
 *  - donors: direct Prisma counts mirroring the exact same trivial
 *    equality filters DonorsService/CampaignsService/DonationsService's
 *    own findAll() already apply (type/active/status) — no business rule
 *    (donation idempotency, campaign lifecycle transitions, ...) is
 *    re-implemented here, only a row count.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financesService: FinancesService,
    private readonly staffService: StaffService,
  ) {}

  /**
   * GET /dashboard/overview's data. `periodType` is the raw, already-
   * validated (by DashboardOverviewQueryDto) query value; resolution to a
   * concrete date range happens once, here, via the shared period util —
   * no aggregation method below computes its own date window.
   *
   * children.presentToday/absentToday (PR 21): the frontend's present/
   * absent rule (utils/childAttendance.ts) has been centralized
   * server-side in child-attendance.util.ts (a faithful, parity-tested
   * port — see that file's own tests), so it is now safe to expose here
   * without risking a second, divergent definition. The population fetched
   * below is every child that is either currently active OR inactive-but-
   * on-a-tracked-temporary-sortie (the util's own state machine narrows
   * this further) — deliberately NOT the same population as `totalActive`
   * (`isActive: true` only). As a result, `presentToday + absentToday` can
   * be *greater* than `totalActive` whenever a child is on a tracked
   * temporary sortie after already being flagged `isActive: false` — this
   * is the centralized rule's own documented semantics (see
   * child-attendance.util.ts's summarizeChildAttendance doc comment), not
   * an inconsistency to "fix" by forcing the two counts to match.
   *
   * presentToday/absentToday/nonConfirmedToday (staff) are always
   * computed for the *real current day*, never for the selected
   * `period` — a week/quarter/year-scoped dashboard view must not imply
   * "50 people were present sometime this quarter"; "today" always means
   * today. This is intentional, not an oversight — see the field's own
   * inline comment below.
   */
  async getOverview(periodType?: string): Promise<DashboardOverviewResponse> {
    const period = resolveDashboardPeriod(periodType);
    const { year, month } = toFinanceYearMonth(period);

    // Deliberately independent of `period` — see this method's own doc
    // comment above. Same "YYYY-MM-DD" shape StaffService.dayBounds
    // already expects (StaffService.listDailyPresence takes a plain date
    // string, not a Date — matching its own existing signature exactly).
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      childrenTotalActive,
      childrenForAttendance,
      dailyPresence,
      staffTotalActive,
      financeDashboard,
      sponsorsActive,
      donationsCount,
      campaignsActive,
    ] = await Promise.all([
      this.prisma.child.count({ where: { isActive: true } }),
      // Curated, non-PII fetch for child-attendance.util.ts's state
      // machine — only the four columns the rule actually needs, never
      // firstName/lastName/guardianName/medical/etc. Bounded to children
      // who are either active OR inactive-with-a-temporary-exitType (the
      // only population the rule can ever count as effectively active);
      // permanently-exited children are excluded at the query level since
      // the rule would exclude them anyway.
      this.prisma.child.findMany({
        where: {
          OR: [{ isActive: true }, { isActive: false, exitType: 'temporaire' }],
        },
        select: {
          isActive: true,
          exitType: true,
          exitDate: true,
          exitReturnDate: true,
        },
      }) as Promise<ChildAttendanceInput[]>,
      // Fetches full StaffMember rows internally (StaffService's own,
      // unmodified implementation) — the names in `dailyPresence.entries`
      // never leave this method; only the derived counts below are
      // returned. See the PR 20 report's "deviations" section for why
      // this was chosen over re-deriving a count-only Prisma query (which
      // would duplicate listDailyPresence's own onLeave/confirmation
      // logic — exactly what this PR was told not to do).
      this.staffService.listDailyPresence(todayStr),
      this.prisma.staffMember.count(),
      this.financesService.getDashboard(year, month),
      // Donor/campaign/donation counts below mirror DonorsPage's own
      // existing dashboard KPI strip exactly (all-time, unfiltered by
      // `period` — same as that page's own donationsApi.list({pageSize:1})
      // pattern) rather than inventing a new "donations this period"
      // concept that doesn't exist anywhere else yet.
      this.prisma.donorProfile.count({
        where: { type: 'PARRAIN', active: true },
      }),
      this.prisma.donation.count(),
      this.prisma.fundraisingCampaign.count({ where: { status: 'ACTIVE' } }),
    ]);

    const childAttendance = summarizeChildAttendance(childrenForAttendance);

    const staffPresentToday = dailyPresence.entries.filter(
      (e) => e.status === 'PRESENT',
    ).length;
    const staffAbsentToday = dailyPresence.entries.filter(
      (e) => e.status === 'ABSENT',
    ).length;

    const budgetRestantXof = financeDashboard.byCategory.reduce(
      (sum, c) => sum + (c.availableXof ?? 0),
      0,
    );

    return {
      period: {
        type: period.type,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      children: {
        totalActive: childrenTotalActive,
        presentToday: childAttendance.present,
        absentToday: childAttendance.absent,
      },
      staff: {
        totalActive: staffTotalActive,
        presentToday: staffPresentToday,
        absentToday: staffAbsentToday,
        nonConfirmedToday: dailyPresence.nonConfirmedCount,
      },
      finance: {
        // "Budget Total" — the approved canonical definition (product
        // decision, PR 20): FinancesService.getDashboard's own
        // soldeCaisseXof. This is an all-time balance (recettes − dépenses
        // validées, no date filter in FinancesService itself), not
        // month-scoped — so it does not actually vary with `period`.
        budgetTotalXof: financeDashboard.soldeCaisseXof,
        // "Budget Restant" — sum of FinancesService's own per-category
        // availableXof (budget minus reserved+consumed), for the
        // calendar month containing the resolved period's start date.
        // See toFinanceYearMonth's own doc comment for the exact
        // period→month adapter rule.
        budgetRestantXof,
      },
      donors: {
        sponsorsActive,
        donationsCount,
        campaignsActive,
      },
    };
  }

  /**
   * GET /dashboard/operations's data (PR 21) — five aggregate "needs
   * attention" counts, DIRECTOR/SUPERVISOR only (enforced by
   * @Roles on the controller route, not here). No `period` — this is
   * always a live, current-moment snapshot (an "open incident" doesn't
   * belong to a week/month/quarter), matching how the equivalent counts
   * already read on DirectorDashboard today.
   *
   * Per-count sourcing, and why each was (or wasn't) built as a curated
   * Prisma query rather than calling the real service's own list method:
   *
   *  - openIncidentsCount / maintenanceTicketsRequiringAttentionCount /
   *    pendingValidationsCount: plain, non-date-dependent status filters
   *    (see this method's own inline comments for the exact filter each
   *    uses) — a direct `count()` carries zero business-rule duplication
   *    risk, so that's all these three are.
   *  - pendingValidationsCount deliberately does NOT call
   *    ValidationsService.findPending(): that method does a full
   *    `findMany` with a per-resource-type N+1 fetch that includes PII
   *    (e.g. assigned contact names) — far more than a dashboard count
   *    needs. A direct count on the exact same `status` filter
   *    findPending() itself applies gets the identical number without
   *    that cost or exposure.
   *  - stockAlertsCount / proceduresRequiringAttentionCount: these ARE
   *    derived booleans (not stored columns), computed today by
   *    StockItemsService's own `withComputedFields`. Rather than
   *    importing that service (the module exports nothing, and its full
   *    list method returns much more than a count needs, including
   *    free-text fields), this reuses a curated, minimal-column fetch and
   *    re-applies the *exact same* formula inline. This is a deliberately
   *    lighter-weight trade-off than child-attendance's full
   *    centralization (PR 21's own explicit "most sensitive item"),
   *    justified because this formula is a simple, static numeric
   *    comparison (not a multi-state date machine) — see the PR 21
   *    report's "deviations" section. stockAlertsCount is quantity-only
   *    (isOutOfStock || isLowStock) — StockItemsService's separate
   *    isExpiringSoon/isOverstocked booleans are intentionally NOT
   *    included, keeping this narrowly scoped to "stock alerts / low-
   *    stock count" as literally requested.
   *  - proceduresRequiringAttentionCount (PR 22 correction): PR 21 only
   *    covered isExpiringSoon here, which silently disagreed with the
   *    real Administration page's own "requiring attention" population
   *    (urgencyRank < 2 — isExpired/isResponseOverdue included too). PR
   *    22 centralizes the full formula in
   *    administrative-procedure-alerts.util.ts's computeProcedureAlerts
   *    (also now the actual implementation behind
   *    AdministrativeProceduresService.withComputedFields — see that
   *    file's own PR 22 comment) and this count is now that same
   *    `requiresAttention` union, so /operations and the new /attention
   *    endpoint can never disagree.
   *
   * The five private helpers below (stockAlertsCount/
   * proceduresAttentionCounts/openIncidentsCount/
   * maintenanceAttentionCount/pendingValidationsCount) are shared
   * verbatim with getAttention() (PR 22) — see this class's own
   * "Notifications vs. attention" doc comment above getAttention for why
   * that sharing matters.
   */
  async getOperations(): Promise<DashboardOperationsResponse> {
    const [
      stockAlerts,
      procedures,
      openIncidents,
      maintenance,
      pendingValidations,
    ] = await Promise.all([
      this.stockAlertsCount(),
      this.proceduresAttentionCounts(),
      this.openIncidentsCount(),
      this.maintenanceAttentionCount(),
      this.pendingValidationsCount(),
    ]);

    return {
      stockAlertsCount: stockAlerts,
      // The full requiresAttention union (overdue + expiringSoon,
      // mutually exclusive buckets — see proceduresAttentionCounts).
      proceduresRequiringAttentionCount:
        procedures.overdue + procedures.expiringSoon,
      openIncidentsCount: openIncidents,
      maintenanceTicketsRequiringAttentionCount: maintenance,
      pendingValidationsCount: pendingValidations,
    };
  }

  // ─── Shared attention-domain aggregations (PR 22) ────────────────────────
  // Each of these is the SINGLE source of truth for its domain's count,
  // called by both getOperations() and getAttention() — see this class's
  // own architecture doc comment for why that sharing is required.

  private async stockAlertsCount(): Promise<number> {
    // Only the two numeric columns the isOutOfStock/isLowStock formula
    // needs — no name/reference/supplier/notes.
    const stockItems = await this.prisma.stockItem.findMany({
      where: { isActive: true },
      select: { currentQuantity: true, minimumQuantity: true },
    });
    // Mirrors StockItemsService.withComputedFields's isOutOfStock/
    // isLowStock exactly (already filtered to isActive:true above, so the
    // `active &&` guard from that formula is redundant here and omitted).
    return stockItems.filter((item) => {
      const isOutOfStock = item.currentQuantity <= 0;
      const isLowStock =
        !isOutOfStock &&
        item.minimumQuantity != null &&
        item.currentQuantity <= item.minimumQuantity;
      return isOutOfStock || isLowStock;
    }).length;
  }

  // Split into two mutually-exclusive buckets matching
  // AdministrativeProceduresService.urgencyRank's own precedence: a
  // procedure that is both isExpired/isResponseOverdue AND
  // isExpiringSoon/isRenewalDueSoon counts once, under `overdue` only —
  // so `overdue + expiringSoon` always equals the plain requiresAttention
  // union with no double-counting.
  private async proceduresAttentionCounts(): Promise<{
    overdue: number;
    expiringSoon: number;
  }> {
    // Only the columns computeProcedureAlerts needs — no title/
    // description/authority/reference/assignedTo.
    const procedures = await this.prisma.administrativeProcedure.findMany({
      where: { status: { not: 'ARCHIVE' } },
      select: {
        status: true,
        expirationDate: true,
        renewalDate: true,
        expectedResponseDate: true,
      },
    });
    let overdue = 0;
    let expiringSoon = 0;
    for (const p of procedures) {
      const alerts = computeProcedureAlerts(p);
      if (alerts.isExpired || alerts.isResponseOverdue) overdue++;
      else if (alerts.isExpiringSoon || alerts.isRenewalDueSoon) expiringSoon++;
    }
    return { overdue, expiringSoon };
  }

  private async openIncidentsCount(): Promise<number> {
    // Mirrors DirectorDashboard's own existing "Demandes à traiter"
    // filter: anything not yet RESOLU.
    return this.prisma.incident.count({ where: { status: { not: 'RESOLU' } } });
  }

  private async maintenanceAttentionCount(): Promise<number> {
    // Anything not in a terminal state.
    return this.prisma.maintenanceTicket.count({
      where: { status: { notIn: ['RESOLU', 'FERME', 'ANNULE'] } },
    });
  }

  private async pendingValidationsCount(): Promise<number> {
    // Mirrors ValidationsService.findPending()'s own `status` filter,
    // bypassing that method's heavier N+1/PII-laden implementation
    // (it includes resource-specific fields like assigned contact names).
    return this.prisma.validationRequest.count({
      where: { status: 'PENDING_VALIDATION' },
    });
  }

  // Split the same way as procedures, matching CampaignsService's own
  // computeCampaignAlerts precedence (isEndDatePassed excludes
  // isEndingSoon at the source) — mutually exclusive, no double-counting.
  private async campaignAlertCounts(): Promise<{
    endingSoon: number;
    pastEnd: number;
  }> {
    // Only status + endDate — no title/description/target amount.
    const campaigns = await this.prisma.fundraisingCampaign.findMany({
      where: { status: 'ACTIVE' },
      select: { status: true, endDate: true },
    });
    let endingSoon = 0;
    let pastEnd = 0;
    for (const c of campaigns) {
      const alerts = computeCampaignAlerts(c);
      if (alerts.isEndDatePassed) pastEnd++;
      else if (alerts.isEndingSoon) endingSoon++;
    }
    return { endingSoon, pastEnd };
  }

  private async donorReportsToPrepareCount(): Promise<number> {
    // Exact Module 5 definition (DonorReportsService.
    // notifyMissingDonorReportsOnce's own where-clause, reused verbatim,
    // not reinterpreted): active PARRAIN profiles with zero DonorReport
    // rows ever created. A direct count on this same filter, never the
    // notification-creating method itself (which also fetches
    // contact.fullName for the notification message — PII this endpoint
    // must not surface).
    return this.prisma.donorProfile.count({
      where: { type: 'PARRAIN', active: true, reports: { none: {} } },
    });
  }

  /**
   * GET /dashboard/attention's data (PR 22) — "what currently requires
   * management attention", DIRECTOR/SUPERVISOR only. A lightweight
   * management projection over existing Modules 1–5 business rules, NOT a
   * second notification system: no NotificationType is created here, no
   * Notification row is ever read as a source of truth, and no cron/
   * background job is involved (same lazy compute-on-read shape as every
   * other Module 6 endpoint).
   *
   * Notifications vs. attention (architecture): a Notification row is a
   * persisted, user-dismissible record of a *past* event ("this became
   * true at some point, and may since have been read or the underlying
   * row deleted"). Dashboard attention is the opposite — a live
   * recomputation of *current* operational state, straight from Modules
   * 1–5's own real business-rule helpers (computeProcedureAlerts,
   * computeCampaignAlerts, StockItemsService's own isOutOfStock/
   * isLowStock formula, the exact same status filters /operations uses).
   * This means: (a) a condition that was never notified still shows up
   * here if it's true right now; (b) a condition that WAS notified but
   * has since been resolved (e.g. the procedure was renewed) does NOT
   * show up here, even though its Notification row may still exist,
   * unread or not. Reading Notification rows as the source of an
   * attention item would violate this — a stale/dismissed notification
   * could either wrongly persist a resolved condition or, if read/
   * cleared, wrongly hide a still-current one. Every item below is
   * therefore built from a fresh query against the real underlying
   * tables, sharing its exact aggregation with /dashboard/operations
   * wherever both represent the same condition (see this class's own
   * "shared attention-domain aggregations" section above).
   *
   * Zero-count conditions are omitted entirely (an empty stock-alert
   * count is not something that "requires attention" — nothing to show).
   * Keys are deterministic constants (see ATTENTION_SEVERITY), never
   * random IDs, so the same underlying condition always produces the
   * same card — no duplicates, safe to key a frontend list on `key`.
   */
  async getAttention(): Promise<DashboardAttentionResponse> {
    const [
      stockAlerts,
      procedures,
      openIncidents,
      maintenance,
      pendingValidations,
      campaigns,
      donorReportsToPrepare,
    ] = await Promise.all([
      this.stockAlertsCount(),
      this.proceduresAttentionCounts(),
      this.openIncidentsCount(),
      this.maintenanceAttentionCount(),
      this.pendingValidationsCount(),
      this.campaignAlertCounts(),
      this.donorReportsToPrepareCount(),
    ]);

    const candidates: DashboardAttentionItem[] = [
      {
        key: 'stock-low',
        domain: 'STOCK',
        severity: ATTENTION_SEVERITY['stock-low'],
        title: 'Stocks faibles',
        message: `${stockAlerts} article(s) en stock faible ou en rupture.`,
        count: stockAlerts,
        targetPath: '/app/stocks-inventaire',
      },
      {
        key: 'maintenance-overdue',
        domain: 'MAINTENANCE',
        severity: ATTENTION_SEVERITY['maintenance-overdue'],
        title: 'Tickets de maintenance à traiter',
        message: `${maintenance} ticket(s) de maintenance nécessitent une action.`,
        count: maintenance,
        targetPath: '/app/administration',
      },
      {
        key: 'procedures-overdue',
        domain: 'PROCEDURES',
        severity: ATTENTION_SEVERITY['procedures-overdue'],
        title: 'Démarches à régulariser',
        message: `${procedures.overdue} démarche(s) administrative(s) expirée(s) ou en attente de réponse dépassée.`,
        count: procedures.overdue,
        targetPath: '/app/demarches-administratives',
      },
      {
        key: 'procedures-expiring',
        domain: 'PROCEDURES',
        severity: ATTENTION_SEVERITY['procedures-expiring'],
        title: 'Démarches bientôt échues',
        message: `${procedures.expiringSoon} démarche(s) administrative(s) arrivent bientôt à échéance ou de renouvellement.`,
        count: procedures.expiringSoon,
        targetPath: '/app/demarches-administratives',
      },
      {
        key: 'incidents-open',
        domain: 'INCIDENTS',
        severity: ATTENTION_SEVERITY['incidents-open'],
        title: 'Incidents ouverts',
        message: `${openIncidents} incident(s) non résolu(s).`,
        count: openIncidents,
        targetPath: '/app/incidents',
      },
      {
        key: 'validations-pending',
        domain: 'VALIDATIONS',
        severity: ATTENTION_SEVERITY['validations-pending'],
        title: 'Validations en attente',
        message: `${pendingValidations} demande(s) en attente de validation.`,
        count: pendingValidations,
        targetPath: '/app/validations',
      },
      {
        key: 'campaigns-ending-soon',
        domain: 'CAMPAIGNS',
        severity: ATTENTION_SEVERITY['campaigns-ending-soon'],
        title: 'Cagnottes bientôt terminées',
        message: `${campaigns.endingSoon} cagnotte(s) se termine(nt) bientôt.`,
        count: campaigns.endingSoon,
        targetPath: '/app/donateurs',
      },
      {
        key: 'campaigns-past-end',
        domain: 'CAMPAIGNS',
        severity: ATTENTION_SEVERITY['campaigns-past-end'],
        title: 'Cagnottes à clôturer',
        message: `${campaigns.pastEnd} cagnotte(s) ont dépassé leur date de fin.`,
        count: campaigns.pastEnd,
        targetPath: '/app/donateurs',
      },
      {
        key: 'donor-reports-to-prepare',
        domain: 'DONOR_REPORTS',
        severity: ATTENTION_SEVERITY['donor-reports-to-prepare'],
        title: 'Rapports donateurs à préparer',
        message: `${donorReportsToPrepare} rapport(s) donateur à préparer.`,
        count: donorReportsToPrepare,
        targetPath: '/app/donateurs',
      },
    ];

    const items = candidates.filter((item) => item.count > 0);

    return {
      summary: {
        total: items.length,
        critical: items.filter((i) => i.severity === 'CRITICAL').length,
        warning: items.filter((i) => i.severity === 'WARNING').length,
        info: items.filter((i) => i.severity === 'INFO').length,
      },
      items,
    };
  }

  /**
   * GET /dashboard/trends's data (PR 21) — three V1 chart-ready series
   * (Recettes vs Dépenses, Donations, Staff attendance), using the same
   * shared period resolution as /overview.
   *
   * Granularity is deliberately NOT forced to one uniform grain across
   * the three series — each mirrors the natural grain of its own
   * authoritative source rather than inventing a new one to make them
   * artificially match:
   *  - finance: for period=today/week, FinancesService.getDailyTrend
   *    (new, PR 21) buckets by day across the resolved [start,end).
   *    For period=month/quarter/year, FinancesService.getMonthlyTrend
   *    (pre-existing, reused verbatim — only its access modifier
   *    changed) returns its own fixed rolling 6-month window ending at
   *    the calendar month containing the period's start — exactly the
   *    same period→month adapter /overview already uses via
   *    toFinanceYearMonth, so a quarter/year selection is never
   *    mislabeled as more than "6 months ending in the month this
   *    period starts in".
   *  - donations: matches finance's own choice of day vs. month buckets
   *    for the *same* resolved ranges (for month/quarter/year, the exact
   *    {year,month} pairs finance's own trend just computed are reused
   *    verbatim as the donation buckets, so the two series are always
   *    chart-aligned) — a single groupBy-free but tightly bounded
   *    `findMany` (date + amountXof only, no donor identity) reduced in
   *    JS, since Prisma has no portable day/month truncation for
   *    groupBy.
   *  - staffAttendance: always one bucket per calendar day across the
   *    exact resolved period (StaffService.listPresenceTrend, reused
   *    verbatim) — there is no existing monthly staff-attendance
   *    aggregation to defer to, and building a second, coarser one here
   *    would itself be a new business rule. For month/quarter/year this
   *    intentionally returns a longer, daily-grain array; bucketing it
   *    down to weeks/months is left to a future PR if the frontend needs
   *    it (documented, not an oversight).
   */
  async getTrends(periodType?: string): Promise<DashboardTrendsResponse> {
    const period = resolveDashboardPeriod(periodType);

    const isDailyGranularity =
      period.type === 'today' || period.type === 'week';

    const [dailyOrMonthlyFinance, staffAttendance] = await Promise.all([
      isDailyGranularity
        ? this.financesService.getDailyTrend(period.start, period.end)
        : this.getMonthlyFinanceBuckets(period),
      this.staffService.listPresenceTrend(this.enumerateDayStrings(period)),
    ]);

    // Normalize both branches to the same {label, recettesXof, depensesXof}
    // shape — getDailyTrend's own return uses `date` (its natural, reusable
    // shape), getMonthlyFinanceBuckets already uses `label`.
    const financeBuckets = isDailyGranularity
      ? (
          dailyOrMonthlyFinance as {
            date: string;
            recettesXof: number;
            depensesXof: number;
          }[]
        ).map((b) => ({
          label: b.date,
          recettesXof: b.recettesXof,
          depensesXof: b.depensesXof,
        }))
      : (dailyOrMonthlyFinance as {
          label: string;
          recettesXof: number;
          depensesXof: number;
        }[]);

    const donations = await this.getDonationsTrend(period, financeBuckets);

    return {
      period: {
        type: period.type,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      finance: financeBuckets.map((b) => ({
        label: b.label,
        recettesXof: b.recettesXof,
        depensesXof: b.depensesXof,
      })),
      donations,
      staffAttendance: staffAttendance.map((s) => ({
        label: s.date,
        present: s.present,
        absent: s.absent,
        nonConfirmed: s.nonConfirmed,
      })),
    };
  }

  // Every "YYYY-MM-DD" day in [period.start, period.end), ascending — the
  // shared day-enumeration StaffService.listPresenceTrend and the
  // today/week finance/donations day-buckets are all built from, so the
  // three series can never silently disagree on which days are in range.
  private enumerateDayStrings(period: ResolvedDashboardPeriod): string[] {
    const days: string[] = [];
    for (
      let d = new Date(period.start);
      d.getTime() < period.end.getTime();
      d = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
      )
    ) {
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }

  // Wraps FinancesService.getMonthlyTrend's own {year,month,recettesXof,
  // depensesXof}[] with a chart-ready `label` ("YYYY-MM") — no aggregation
  // logic of its own.
  private async getMonthlyFinanceBuckets(
    period: ResolvedDashboardPeriod,
  ): Promise<{ label: string; recettesXof: number; depensesXof: number }[]> {
    const { year, month } = toFinanceYearMonth(period);
    const monthlyTrend = await this.financesService.getMonthlyTrend(
      year,
      month,
    );
    return monthlyTrend.map((m) => ({
      label: `${m.year}-${String(m.month).padStart(2, '0')}`,
      recettesXof: m.recettesXof,
      depensesXof: m.depensesXof,
    }));
  }

  // Donation amounts/counts, bucketed to match whichever granularity
  // `financeBuckets` just used (day labels for today/week, "YYYY-MM"
  // labels for month/quarter/year) so the two series stay chart-aligned.
  // Single bounded findMany (date + amountXof only — no donor identity),
  // reduced in JS; Prisma has no portable day/month truncation for
  // groupBy, so this is the pragmatic, honestly-documented choice per the
  // PR 21 instruction rather than a raw-SQL addition.
  private async getDonationsTrend(
    period: ResolvedDashboardPeriod,
    financeBuckets: { label: string }[],
  ): Promise<{ label: string; amountXof: number; count: number }[]> {
    const isDailyGranularity =
      period.type === 'today' || period.type === 'week';

    // For month/quarter/year, span exactly the months financeBuckets just
    // covered (its rolling 6-month window) — not just the resolved
    // period — so the two series describe the same calendar range.
    let rangeStart = period.start;
    let rangeEnd = period.end;
    if (!isDailyGranularity && financeBuckets.length > 0) {
      const firstLabel = financeBuckets[0].label; // "YYYY-MM"
      const [firstYear, firstMonth] = firstLabel.split('-').map(Number);
      rangeStart = new Date(Date.UTC(firstYear, firstMonth - 1, 1));
      rangeEnd = period.end;
    }

    const donations = await this.prisma.donation.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      select: { date: true, amountXof: true },
    });

    const buckets = new Map(
      financeBuckets.map((b) => [b.label, { amountXof: 0, count: 0 }]),
    );
    for (const d of donations) {
      const label = isDailyGranularity
        ? d.date.toISOString().slice(0, 10)
        : `${d.date.getUTCFullYear()}-${String(d.date.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(label);
      if (!bucket) continue; // outside the pre-seeded label set — defensive only
      bucket.amountXof += d.amountXof;
      bucket.count += 1;
    }

    return financeBuckets.map((b) => ({
      label: b.label,
      amountXof: buckets.get(b.label)?.amountXof ?? 0,
      count: buckets.get(b.label)?.count ?? 0,
    }));
  }
}
