import { useCallback, useState } from 'react';
import {
  DollarSign, Wallet, UserCheck, UserX, Users, HeartHandshake, Gift, Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  dashboardApi, DEFAULT_DASHBOARD_PERIOD,
  type ApiDashboardPeriodType, type ApiDashboardOverview,
} from '../services/dashboard.api';
import {
  SectionTitle, useDashboardFetch, PeriodSelector, KPICard, SectionError,
} from '../components/dashboard/DashboardShared';
import { TrendsSection } from '../components/dashboard/DashboardTrends';
import { formatXof } from '../config/financeCategories.config';

// ─── Main Dashboard ───────────────────────────────────────────────────────────
//
// Module 6 (PR 24) — BOARD rebuilt from scratch on the real Module 6
// aggregate backbone. Everything the previous version showed
// (governanceIndicators, the hardcoded "840 000 DA"/"653 400 DA"/
// "186 600 DA" budget block, monthlyTrendData, boardReports/
// documentDeadlines, the toast-only "Exporter la synthèse" button) was
// mock/hardcoded — none of it ever came from a real backend, and none of
// it is a Module 6 aggregate, so it is gone, not relabeled. The old
// "Rapports disponibles" section (fake deadlines/report rows) had no real
// Module 6 equivalent either; consulting real reports is already BOARD's
// own dedicated sidebar page (/app/reports — "Consulter les rapports"),
// so this dashboard doesn't attempt a second, duplicate reports list.
//
// BOARD only ever calls GET /dashboard/overview and GET /dashboard/trends
// — both are DIRECTOR/SUPERVISOR/BOARD per DashboardController, every field
// on them is already an aggregate (count/sum/chart series), never a
// person-level object. GET /dashboard/operations and GET /dashboard/
// attention are DIRECTOR/SUPERVISOR only (the backend 403s BOARD on both —
// see DashboardController's own @Roles override on those two routes) and
// are deliberately never called here — no operational "À traiter" feed, no
// Opérations cards, no PendingValidationsList, on this dashboard.
//
// No KPI card below is clickable: BOARD has no access to /app/children,
// /app/team, /app/finances or /app/donateurs (all DIRECTOR/SUPERVISOR-only
// at the backend's own RolesGuard — see e.g. DonorsPage's own `isBoard`
// early return), so a drill-down click would only ever dead-end. These are
// plain, non-interactive `<div>` cards (KPICard renders a `<div>`, not a
// `<button>`, whenever no `onClick` is passed).
//
// No "Non confirmés" staff KPI: unlike Director/Supervisor, BOARD's own
// documented overview scope (PR 24 spec) is Personnel actif/Présents/
// Absents only — a per-person confirmation state reads as an operational
// detail, not a governance figure. The Présence du personnel *trend* chart
// still includes its own aggregate nonConfirmed series (a chart label, not
// a person), which stays in bounds for a governance/reporting dashboard.
//
// No "Governance summary" section: the old mock indicators (taux de
// présence %, "Enfants suivis", "Budget consommé" %) have no real Module 6
// equivalent — Budget Total and Budget Restant are two different concepts
// (an all-time cash balance vs. a current-month per-category remainder),
// not subtractable into a meaningful "% consumed" without inventing a
// metric the backend doesn't provide. Per the PR 24 instruction ("do not
// invent governance metrics that have no backend source... if a previous
// mock metric has no real equivalent, remove it"), it's removed, not
// reinvented — the Overview/Finance/Donors sections below already surface
// every real aggregate Module 6 exposes to BOARD.

export function BoardDashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<ApiDashboardPeriodType>(DEFAULT_DASHBOARD_PERIOD);

  const overview = useDashboardFetch(useCallback(() => dashboardApi.getOverview(period), [period]), [period]);
  const trends = useDashboardFetch(useCallback(() => dashboardApi.getTrends(period), [period]), [period]);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const ov: ApiDashboardOverview | null = overview.data;

  return (
    <div data-testid="board-dashboard" className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1400 }}>

      {/* ── Header + period selector ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
            Bonjour, {user?.name.split(' ')[0]}
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
            {today} · Vue Conseil d'Administration
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {overview.error ? (
        <SectionError testId="overview-error" onRetry={overview.reload} />
      ) : (
        <>
          {/* ── Vue d'ensemble : Enfants ── */}
          <div>
            <SectionTitle testId="section-title-situation-enfants" style={{ marginBottom: 10 }}>
              VUE D'ENSEMBLE — ENFANTS
            </SectionTitle>
            <div data-testid="child-presence-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard
                testId="kpi-children-total"
                title="Enfants accueillis" value={overview.loading ? '—' : ov?.children.totalActive ?? 0} subtitle="Actifs"
                icon={Users} iconColor="#3E5A78" iconBg="#EEF2F7"
              />
              <KPICard
                testId="kpi-child-presence-present"
                title="Présents" value={overview.loading ? '—' : ov?.children.presentToday ?? 0} subtitle="Aujourd'hui"
                icon={UserCheck} iconColor="#065F46" iconBg="#ECFDF5"
              />
              <KPICard
                testId="kpi-child-presence-absent"
                title="Absents" value={overview.loading ? '—' : ov?.children.absentToday ?? 0} subtitle="Aujourd'hui"
                icon={UserX} iconColor="#B91C1C" iconBg="#FEF2F2"
              />
            </div>
          </div>

          {/* ── Vue d'ensemble : Personnel (no "Non confirmés" — see this
              file's own doc comment above) ── */}
          <div>
            <SectionTitle testId="section-title-presence-equipe" style={{ marginBottom: 10 }}>
              VUE D'ENSEMBLE — PERSONNEL
            </SectionTitle>
            <div data-testid="team-presence-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard
                testId="kpi-staff-total"
                title="Personnel actif" value={overview.loading ? '—' : ov?.staff.totalActive ?? 0} subtitle="Effectif"
                icon={Users} iconColor="#3E5A78" iconBg="#EEF2F7"
              />
              <KPICard
                testId="kpi-presence-present"
                title="Présents" value={overview.loading ? '—' : ov?.staff.presentToday ?? 0} subtitle="Aujourd'hui"
                icon={UserCheck} iconColor="#065F46" iconBg="#ECFDF5"
              />
              <KPICard
                testId="kpi-presence-absent"
                title="Absents" value={overview.loading ? '—' : ov?.staff.absentToday ?? 0} subtitle="Aujourd'hui"
                icon={UserX} iconColor="#B91C1C" iconBg="#FEF2F2"
              />
            </div>
          </div>

          {/* ── Finances — Budget Total / Budget Restant only, same
              canonical Module 6 figures Director/Supervisor show, in
              XOF/FCFA — never DA, never a fabricated value. ── */}
          <div>
            <SectionTitle testId="section-title-finances" style={{ marginBottom: 10 }}>
              FINANCES
            </SectionTitle>
            <div data-testid="finance-kpis" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KPICard testId="kpi-budget-total"   title="Budget Total"   value={overview.loading ? '—' : formatXof(ov?.finance.budgetTotalXof ?? 0)}   subtitle="Solde global" icon={DollarSign} iconColor="#3E5A78" iconBg="#EEF2F7" />
              <KPICard testId="kpi-budget-restant" title="Budget Restant" value={overview.loading ? '—' : formatXof(ov?.finance.budgetRestantXof ?? 0)} subtitle="Disponible à engager" icon={Wallet} iconColor="#065F46" iconBg="#ECFDF5" />
            </div>
          </div>

          {/* ── Donateurs & Parrains — aggregate counts only, no donor
              names, no contacts, no per-donation rows. ── */}
          <div>
            <SectionTitle testId="section-title-donateurs" style={{ marginBottom: 10 }}>
              DONATEURS &amp; PARRAINS
            </SectionTitle>
            <div data-testid="donor-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard
                testId="kpi-donors-sponsors"
                title="Parrains actifs" value={overview.loading ? '—' : ov?.donors.sponsorsActive ?? 0} subtitle="Parrainages en cours"
                icon={HeartHandshake} iconColor="#3E5A78" iconBg="#EEF2F7"
              />
              <KPICard
                testId="kpi-donors-donations"
                title="Dons" value={overview.loading ? '—' : ov?.donors.donationsCount ?? 0} subtitle="Total enregistré"
                icon={Gift} iconColor="#065F46" iconBg="#ECFDF5"
              />
              <KPICard
                testId="kpi-donors-campaigns"
                title="Cagnottes actives" value={overview.loading ? '—' : ov?.donors.campaignsActive ?? 0} subtitle="En cours"
                icon={Target} iconColor="#7C3AED" iconBg="#F5F3FF"
              />
            </div>
          </div>
        </>
      )}

      {/* ── Tendances (Module 6 charts) — Recettes vs Dépenses, Évolution
          des dons, Présence du personnel; all three from /dashboard/trends,
          BOARD-accessible, aggregate-only. ── */}
      <TrendsSection {...trends} onRetry={trends.reload} />

      <div style={{ height: 24 }} />
    </div>
  );
}
