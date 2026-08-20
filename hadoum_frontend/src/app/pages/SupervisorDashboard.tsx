import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  DollarSign, Wallet, UserCheck, UserX, Circle, Users, HeartHandshake, Gift, Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PendingValidationsList } from '../components/validations/PendingValidationsList';
import {
  dashboardApi, DEFAULT_DASHBOARD_PERIOD,
  type ApiDashboardPeriodType, type ApiDashboardOverview,
} from '../services/dashboard.api';
import {
  SectionTitle, useDashboardFetch, PeriodSelector, KPICard,
} from '../components/dashboard/DashboardShared';
import { OperationsSection } from '../components/dashboard/DashboardOperations';
import { AttentionSection } from '../components/dashboard/DashboardAttention';
import { TrendsSection } from '../components/dashboard/DashboardTrends';
import { formatXof } from '../config/financeCategories.config';

// ─── Main Dashboard ───────────────────────────────────────────────────────────
//
// Module 6 (PR 24) — SUPERVISOR upgraded from the minimal validations-only
// page it used to be (see the removed sections' own history below) into a
// real management/oversight dashboard: the exact same Module 6 aggregate
// backbone as DirectorDashboard (overview/operations/trends/attention, via
// the shared components in ../components/dashboard), plus the pending-
// validations list SUPERVISOR already had. SUPERVISOR stays strictly
// read-only here — no Quick Actions, no mutation control is introduced by
// this dashboard (approve/reject on <PendingValidationsList /> is existing,
// unchanged validation-workflow behavior, not a dashboard mutation).
//
// This page used to also carry a decision-focus summary block (count/delay
// text + an incident badge), a "Suivi des incidents" section, and a "Vue
// économique" section (a *mock*, never backend-connected fund-requests
// list) — all removed in earlier passes, well before Module 6 existed.
// "Incidents ouverts" now legitimately reappears as one of the five real
// Opérations cards below (and possibly in À traiter) — this is the Module 6
// aggregate count, backend-sourced, not a resurrection of that old mock
// section; see supervisor.spec.ts's own updated coverage.
//
// Staff/child drill-down navigation: SUPERVISOR has no access to
// /app/team (TeamPage redirects supervisor straight back to /app/dashboard)
// so the staff presence KPIs below are deliberately non-interactive
// (no onClick — plain display cards), unlike DirectorDashboard's. Child
// presence and donor KPIs DO navigate — SUPERVISOR already has direct
// access to /app/children and /app/donateurs (see Sidebar.tsx's own
// secondary nav for the donor link; ChildrenPage carries no supervisor
// redirect).

export function SupervisorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ApiDashboardPeriodType>(DEFAULT_DASHBOARD_PERIOD);

  const overview = useDashboardFetch(useCallback(() => dashboardApi.getOverview(period), [period]), [period]);
  const operations = useDashboardFetch(useCallback(() => dashboardApi.getOperations(), []), []);
  const trends = useDashboardFetch(useCallback(() => dashboardApi.getTrends(period), [period]), [period]);
  const attention = useDashboardFetch(useCallback(() => dashboardApi.getAttention(), []), []);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const goToChildAttendance = (status: 'present' | 'absent') =>
    navigate(`/app/children?attendance=${status}`);

  const ov: ApiDashboardOverview | null = overview.data;

  return (
    <div data-testid="supervisor-dashboard" className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1400 }}>

      {/* ── Header + period selector ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
            Bonjour, {user?.name.split(' ')[0]}
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
            {today} · Vue supervision
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* ── Situation aujourd'hui : Enfants ── */}
      <div>
        <SectionTitle testId="section-title-situation-enfants" style={{ marginBottom: 10 }}>
          SITUATION AUJOURD'HUI — ENFANTS
        </SectionTitle>
        <div data-testid="child-presence-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            testId="kpi-children-total"
            title="Enfants accueillis" value={overview.loading ? '—' : ov?.children.totalActive ?? 0} subtitle="Actifs"
            icon={Users} iconColor="#3E5A78" iconBg="#EEF2F7"
            onClick={() => navigate('/app/children')}
          />
          <KPICard
            testId="kpi-child-presence-present"
            title="Présents" value={overview.loading ? '—' : ov?.children.presentToday ?? 0} subtitle="Aujourd'hui"
            icon={UserCheck} iconColor="#065F46" iconBg="#ECFDF5"
            onClick={() => goToChildAttendance('present')}
          />
          <KPICard
            testId="kpi-child-presence-absent"
            title="Absents" value={overview.loading ? '—' : ov?.children.absentToday ?? 0} subtitle="Aujourd'hui"
            icon={UserX} iconColor="#B91C1C" iconBg="#FEF2F2"
            onClick={() => goToChildAttendance('absent')}
          />
        </div>
      </div>

      {/* ── Situation aujourd'hui : Personnel ──
          Deliberately non-interactive (no onClick): SUPERVISOR has no
          access to /app/team — see this file's own doc comment above. */}
      <div>
        <SectionTitle testId="section-title-presence-equipe" style={{ marginBottom: 10 }}>
          SITUATION AUJOURD'HUI — PERSONNEL
        </SectionTitle>
        <div data-testid="team-presence-kpis" className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
          <KPICard
            testId="kpi-presence-non-confirmed"
            title="Non confirmés" value={overview.loading ? '—' : ov?.staff.nonConfirmedToday ?? 0} subtitle="Aujourd'hui"
            icon={Circle}
            iconColor={(ov?.staff.nonConfirmedToday ?? 0) > 0 ? '#D97706' : '#6B7280'}
            iconBg={(ov?.staff.nonConfirmedToday ?? 0) > 0 ? '#FFFBEB' : '#F3F4F6'}
            highlight={(ov?.staff.nonConfirmedToday ?? 0) > 0}
          />
        </div>
      </div>

      {/* ── Finances — Budget Total / Budget Restant only, straight from
          /dashboard/overview, never recomputed client-side. No "Budget
          alloué" card here (that legacy allocated-category-budget figure
          is a Director-only addition, sourced from a SUPERVISOR/DIRECTOR-
          only finances endpoint the dashboard itself never calls). ── */}
      <div>
        <SectionTitle testId="section-title-finances" style={{ marginBottom: 10 }}>
          FINANCES
        </SectionTitle>
        <div data-testid="finance-kpis" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KPICard testId="kpi-budget-total"   title="Budget Total"   value={overview.loading ? '—' : formatXof(ov?.finance.budgetTotalXof ?? 0)}   subtitle="Solde global" icon={DollarSign} iconColor="#3E5A78" iconBg="#EEF2F7" />
          <KPICard testId="kpi-budget-restant" title="Budget Restant" value={overview.loading ? '—' : formatXof(ov?.finance.budgetRestantXof ?? 0)} subtitle="Disponible à engager" icon={Wallet} iconColor="#065F46" iconBg="#ECFDF5" />
        </div>
      </div>

      {/* ── Donateurs & Parrains — same /app/donateurs?tab=… drill-down
          convention introduced by Director in PR 23; SUPERVISOR already
          has direct access to that page (Sidebar's own secondary nav). ── */}
      <div>
        <SectionTitle testId="section-title-donateurs" style={{ marginBottom: 10 }}>
          DONATEURS &amp; PARRAINS
        </SectionTitle>
        <div data-testid="donor-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            testId="kpi-donors-sponsors"
            title="Parrains actifs" value={overview.loading ? '—' : ov?.donors.sponsorsActive ?? 0} subtitle="Parrainages en cours"
            icon={HeartHandshake} iconColor="#3E5A78" iconBg="#EEF2F7"
            onClick={() => navigate('/app/donateurs?tab=parrains')}
          />
          <KPICard
            testId="kpi-donors-donations"
            title="Dons" value={overview.loading ? '—' : ov?.donors.donationsCount ?? 0} subtitle="Total enregistré"
            icon={Gift} iconColor="#065F46" iconBg="#ECFDF5"
            onClick={() => navigate('/app/donateurs?tab=dons')}
          />
          <KPICard
            testId="kpi-donors-campaigns"
            title="Cagnottes actives" value={overview.loading ? '—' : ov?.donors.campaignsActive ?? 0} subtitle="En cours"
            icon={Target} iconColor="#7C3AED" iconBg="#F5F3FF"
            onClick={() => navigate('/app/donateurs?tab=cagnottes')}
          />
        </div>
      </div>

      {/* ── Demandes à valider — every pending ValidationRequest, any
          resource type, one list, with real Approuver/Refuser actions
          (SUPERVISOR's own existing decision authority — unchanged, not a
          dashboard mutation introduced by this PR). ── */}
      <PendingValidationsList variant="card" />

      {/* ── Opérations (Module 6) ── */}
      <OperationsSection {...operations} onRetry={operations.reload} />

      {/* ── À traiter (Module 6 attention feed) ── */}
      <AttentionSection {...attention} onRetry={attention.reload} />

      {/* ── Tendances (Module 6 charts) ── */}
      <TrendsSection {...trends} onRetry={trends.reload} />

      <div style={{ height: 24 }} />
    </div>
  );
}
