import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AddModal } from './ChildrenPage';
import {
  Plus, CalendarCheck, FileText, ChevronRight, DollarSign, Wallet,
  UserCheck, UserX, Circle, X, CheckCircle2, XCircle, Hourglass,
  ClipboardCheck, HeartHandshake, Gift, Target, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { financesApi, type ApiTransaction } from '../services/finances.api';
import {
  teamApi, nonConfirmedEligibleEntries,
  type ApiDailyPresence, type ApiDailyPresenceEntry,
} from '../services/team.api';
import { formatXof } from '../config/financeCategories.config';
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

// ─── "Non confirmées" modal (staff) ────────────────────────────────────────
// Module 6 (PR 23): the KPI count itself now comes from
// /dashboard/overview.staff.nonConfirmedToday (an aggregate, no PII). This
// modal is the one place that genuinely needs staff names — it's a
// director-triggered drill-down action, not a page-load calculation — so
// its own GET /staff/presence fetch happens lazily, only when the modal is
// actually opened, never eagerly on dashboard load. "Confirmer" navigates
// to Mon équipe → Présences; it never confirms anything itself.

function NonConfirmedModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [presence, setPresence] = useState<ApiDailyPresence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teamApi.listDailyPresence(new Date().toISOString().slice(0, 10))
      .then(setPresence)
      .catch(() => toast.error('Erreur de chargement des présences.'))
      .finally(() => setLoading(false));
  }, []);

  const entries: ApiDailyPresenceEntry[] = presence ? nonConfirmedEligibleEntries(presence) : [];

  const goConfirm = (entry: ApiDailyPresenceEntry) => {
    onClose();
    navigate(`/app/team?tab=attendance&status=NON_CONFIRMED&search=${encodeURIComponent(`${entry.firstName} ${entry.lastName}`)}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="non-confirmed-modal"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 data-testid="non-confirmed-modal-title" style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>
            {loading ? 'Présences non confirmées' : `Présences non confirmées (${entries.length})`}
          </h3>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-2">
          {loading ? (
            <div className="py-10 text-center">
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 size={26} style={{ color: '#065F46', margin: '0 auto 8px' }} />
              <p style={{ color: '#374151', fontSize: 13 }}>Aucune présence en attente de confirmation.</p>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: '#F9F7F3' }}>
              {entries.map(entry => {
                const initials = `${entry.firstName[0] ?? '?'}${entry.lastName[0] ?? '?'}`.toUpperCase();
                return (
                  <li key={entry.staffId} data-testid={`non-confirmed-row-${entry.staffId}`} className="flex items-center gap-3 py-3.5">
                    <div className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{ width: 36, height: 36, background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontWeight: 700 }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{entry.firstName} {entry.lastName}</p>
                      <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{entry.role}</p>
                      <span className="inline-block px-2 py-0.5 rounded-full mt-1"
                        style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 10, fontWeight: 600 }}>
                        Non confirmée
                      </span>
                    </div>
                    <button
                      data-testid={`confirm-nav-${entry.staffId}`}
                      onClick={() => goConfirm(entry)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg flex-shrink-0"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                    >
                      Confirmer <ChevronRight size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions({ onAddChild }: { onAddChild: () => void }) {
  const navigate = useNavigate();

  const actions = [
    { key: 'add-child',  label: 'Ajouter un enfant', icon: Plus,          color: '#3E5A78', bg: '#EEF2F7', desc: 'Nouveau dossier', onClick: onAddChild },
    { key: 'attendance', label: 'Saisir présences',  icon: CalendarCheck, color: '#065F46', bg: '#ECFDF5', desc: 'Pointage du jour', onClick: () => navigate('/app/team?tab=attendance') },
    { key: 'reports',    label: 'Générer un rapport',icon: FileText,      color: '#7C3AED', bg: '#F5F3FF', desc: 'PDF / Export',     onClick: () => navigate('/app/reports') },
  ];

  return (
    <div>
      <SectionTitle testId="section-title-actions-rapides" style={{ marginBottom: 10 }}>
        ACTIONS RAPIDES
      </SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              data-testid={`quick-action-${action.key}`}
              onClick={action.onClick}
              className="flex items-center gap-3 px-4 py-4 rounded-xl text-left transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: '#FFFFFF', border: '1.5px solid #3E5A78', cursor: 'pointer' }}
            >
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 40, height: 40, background: action.bg }}
              >
                <Icon size={18} style={{ color: action.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 700 }}>{action.label}</p>
                <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{action.desc}</p>
              </div>
              <ChevronRight size={14} style={{ color: '#3E5A78', flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recent Activity (Module 1-5, unchanged) ───────────────────────────────

interface ActivityItem {
  id: string;
  kind: 'expense-rejected' | 'expense-pending';
  label: string;
  detail: string;
  at: string;
  to: string;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const navigate = useNavigate();
  const style: Record<ActivityItem['kind'], { icon: React.ElementType; color: string; bg: string; verb: string }> = {
    'expense-rejected': { icon: XCircle,   color: '#B91C1C', bg: '#FEF2F2', verb: 'Dépense refusée' },
    'expense-pending':  { icon: Hourglass, color: '#D97706', bg: '#FFFBEB', verb: 'En attente' },
  };
  const s = style[item.kind];
  const Icon = s.icon;
  const date = new Date(item.at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <li>
      <button
        onClick={() => navigate(item.to)}
        className="w-full flex items-center gap-3 py-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 32, height: 32, background: s.bg }}>
          <Icon size={15} style={{ color: s.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>
            {s.verb} <span style={{ color: '#6B7280', fontWeight: 400 }}>— {item.label}</span>
          </p>
          <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{item.detail} · {date}</p>
        </div>
      </button>
    </li>
  );
}

function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <div data-testid="recent-activity" className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <SectionTitle testId="section-title-activite-recente">Activité récente</SectionTitle>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Dernières décisions et interventions</p>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CheckCircle2 size={22} style={{ color: '#065F46', margin: '0 auto 8px' }} />
          <p style={{ color: '#6B7280', fontSize: 13 }}>Aucune dépense refusée ou en attente</p>
        </div>
      ) : (
        <ul className="divide-y px-5" style={{ borderColor: '#F9F7F3' }}>
          {items.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} />)}
        </ul>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function DirectorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAddChild, setShowAddChild] = useState(false);
  const [showNonConfirmed, setShowNonConfirmed] = useState(false);
  const [period, setPeriod] = useState<ApiDashboardPeriodType>(DEFAULT_DASHBOARD_PERIOD);

  // ── Module 6 aggregate data — the dashboard's sole source of truth for
  //    every KPI/operations/attention/trend number below. No child, staff,
  //    or donor list is ever fetched here merely to compute a count. ──
  const overview = useDashboardFetch(useCallback(() => dashboardApi.getOverview(period), [period]), [period]);
  const operations = useDashboardFetch(useCallback(() => dashboardApi.getOperations(), []), []);
  const trends = useDashboardFetch(useCallback(() => dashboardApi.getTrends(period), [period]), [period]);
  const attention = useDashboardFetch(useCallback(() => dashboardApi.getAttention(), []), []);

  // ── "Budget alloué" (legacy allocated-category-budget figure) — kept per
  //    the approved Module 6 product decision (PR 20): this is a genuinely
  //    different concept from Module 6's canonical Budget Total
  //    (soldeCaisseXof), so it stays, correctly labeled, never under the
  //    "Budget Total" name. Still sourced from FinancesService.getDashboard
  //    (unchanged) — Module 6 has no "allocated budget" figure to replace
  //    it with, this is not duplicated dashboard-only aggregation. ──
  const [budgetAlloueXof, setBudgetAlloueXof] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<ApiTransaction[]>([]);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    financesApi.getDashboard()
      .then(d => setBudgetAlloueXof(d.byCategory.reduce((sum, c) => sum + (c.budgetXof ?? 0), 0)))
      .catch(() => toast.error('Erreur de chargement du budget alloué.'));

    financesApi.listTransactions({ type: 'DEPENSE', from, to })
      .then(setExpenses)
      .catch(() => toast.error('Erreur de chargement des dépenses récentes.'));
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Recent activity feed — rejected and pending expenses only ──
  const recentActivity: ActivityItem[] = expenses
    .filter(t => t.expenseWorkflowStatus === 'REJECTED' || t.expenseWorkflowStatus === 'PENDING_APPROVAL')
    .map((t): ActivityItem => ({
      id: t.id,
      kind: t.expenseWorkflowStatus === 'REJECTED' ? 'expense-rejected' : 'expense-pending',
      label: t.label,
      detail: formatXof(t.amountXof),
      at: t.updatedAt,
      to: '/app/finances',
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  const goToAttendance = (status: 'PRESENT' | 'ABSENT') =>
    navigate(`/app/team?tab=attendance&status=${status}`);
  const goToChildAttendance = (status: 'present' | 'absent') =>
    navigate(`/app/children?attendance=${status}`);

  const ov: ApiDashboardOverview | null = overview.data;

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1400 }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
            Tableau de bord
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
            Bonjour, {user?.name.split(' ')[0]} · {today}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* ── Quick actions (first content block below the header) ── */}
      <QuickActions onAddChild={() => setShowAddChild(true)} />

      {/* ── À traiter (Module 6 attention feed) ── */}
      <AttentionSection {...attention} onRetry={attention.reload} />

      {/* ── Situation aujourd'hui : Enfants ──
          Deliberately two cards only — children have no confirmation step
          and no "Non confirmé" state (see Module 6 backend's own doc
          comment on child-attendance.util.ts). */}
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

      {/* ── Situation aujourd'hui : Personnel ── */}
      <div>
        <SectionTitle testId="section-title-presence-equipe" style={{ marginBottom: 10 }}>
          SITUATION AUJOURD'HUI — PERSONNEL
        </SectionTitle>
        <div data-testid="team-presence-kpis" className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <KPICard
            testId="kpi-staff-total"
            title="Personnel actif" value={overview.loading ? '—' : ov?.staff.totalActive ?? 0} subtitle="Effectif"
            icon={Users} iconColor="#3E5A78" iconBg="#EEF2F7"
            onClick={() => navigate('/app/team?tab=attendance')}
          />
          <KPICard
            testId="kpi-presence-present"
            title="Présents" value={overview.loading ? '—' : ov?.staff.presentToday ?? 0} subtitle="Aujourd'hui"
            icon={UserCheck} iconColor="#065F46" iconBg="#ECFDF5"
            onClick={() => goToAttendance('PRESENT')}
          />
          <KPICard
            testId="kpi-presence-absent"
            title="Absents" value={overview.loading ? '—' : ov?.staff.absentToday ?? 0} subtitle="Aujourd'hui"
            icon={UserX} iconColor="#B91C1C" iconBg="#FEF2F2"
            onClick={() => goToAttendance('ABSENT')}
          />
          <KPICard
            testId="kpi-presence-non-confirmed"
            title="Non confirmés" value={overview.loading ? '—' : ov?.staff.nonConfirmedToday ?? 0} subtitle="Aujourd'hui"
            icon={Circle}
            iconColor={(ov?.staff.nonConfirmedToday ?? 0) > 0 ? '#D97706' : '#6B7280'}
            iconBg={(ov?.staff.nonConfirmedToday ?? 0) > 0 ? '#FFFBEB' : '#F3F4F6'}
            highlight={(ov?.staff.nonConfirmedToday ?? 0) > 0}
            onClick={overview.loading ? undefined : () => setShowNonConfirmed(true)}
          />
        </div>
      </div>

      {/* ── Finances ──
          Budget Total / Budget Restant: the approved Module 6 canonical
          figures, straight from /dashboard/overview — never recomputed
          client-side. Budget alloué: the legacy allocated-category-budget
          figure, correctly relabeled (see budgetAlloueXof's own comment
          above) — never shown under the "Budget Total" name. */}
      <div>
        <SectionTitle testId="section-title-finances" style={{ marginBottom: 10 }}>
          FINANCES
        </SectionTitle>
        <div data-testid="finance-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard testId="kpi-budget-total"    title="Budget Total"   value={overview.loading ? '—' : formatXof(ov?.finance.budgetTotalXof ?? 0)}   subtitle="Solde global" icon={DollarSign} iconColor="#3E5A78" iconBg="#EEF2F7" />
          <KPICard testId="kpi-budget-restant"  title="Budget Restant" value={overview.loading ? '—' : formatXof(ov?.finance.budgetRestantXof ?? 0)} subtitle="Disponible à engager" icon={Wallet} iconColor="#065F46" iconBg="#ECFDF5" />
          <KPICard testId="kpi-budget-alloue"   title="Budget alloué"  value={budgetAlloueXof === null ? '—' : formatXof(budgetAlloueXof)}           subtitle="Toutes catégories · mois en cours" icon={ClipboardCheck} iconColor="#374151" iconBg="#F3F4F6" />
        </div>
      </div>

      {/* ── Opérations (Module 6) ── */}
      <OperationsSection {...operations} onRetry={operations.reload} />

      {/* ── Donateurs & Parrains ── */}
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

      {/* ── Tendances (Module 6 charts) ── */}
      <TrendsSection {...trends} onRetry={trends.reload} />

      {/* ── Recent Activity ── */}
      <RecentActivity items={recentActivity} />

      <div style={{ height: 24 }} />

      {showNonConfirmed && (
        <NonConfirmedModal onClose={() => setShowNonConfirmed(false)} />
      )}

      {showAddChild && (
        <AddModal
          onCreated={() => {
            setShowAddChild(false);
            navigate('/app/children');
          }}
          onClose={() => setShowAddChild(false)}
        />
      )}
    </div>
  );
}
