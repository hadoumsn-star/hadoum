import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AddModal } from './ChildrenPage';
import {
  TrendingUp, TrendingDown, Plus, CalendarCheck,
  FileText, Clock, CheckCircle2, ChevronRight,
  Minus, DollarSign, XCircle, Wallet, Hourglass,
  UserCheck, UserX, Circle, X, Eye, ShieldAlert, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { financesApi, type ApiDashboard, type ApiTransaction } from '../services/finances.api';
import {
  teamApi, summarizeDailyPresence, nonConfirmedEligibleEntries,
  type ApiDailyPresence, type ApiDailyPresenceEntry,
} from '../services/team.api';
import { formatXof } from '../config/financeCategories.config';
import { incidentsApi, type ApiIncident } from '../services/incidents.api';
import {
  INCIDENT_STATUS_LABELS, INCIDENT_STATUS_STYLE,
  INCIDENT_PRIORITY_BADGE_LABELS, INCIDENT_PRIORITY_STYLE, INCIDENT_PRIORITY_LABELS,
  incidentConcernedSummary,
} from '../config/incidents.config';
import { childrenApi } from '../services/children.api';
import { mapSummaryToChild } from '../services/children.mapper';
import { summarizeChildAttendance } from '../utils/childAttendance';

// ─── Section title (shared across every Director Dashboard block) ─────────
// One consistent heading style for "ACTIONS RAPIDES", "DEMANDES À TRAITER",
// "FINANCES", "PRÉSENCE DE L'ÉQUIPE", "PRÉSENCE DES ENFANTS" and "Activité
// récente" — larger and bolder than a KPICard's own title line (14px/500),
// so section titles read clearly above the cards they head, on both mobile
// and desktop. `style` lets call sites keep their own spacing unchanged
// (some sit above a card grid with a bottom margin, RecentActivity's own
// header already spaces itself from its subtitle).
function SectionTitle({ children, testId, style }: { children: React.ReactNode; testId?: string; style?: React.CSSProperties }) {
  return (
    <h3
      data-testid={testId}
      className="text-[15px] sm:text-[17px] font-bold"
      style={{ color: '#1A1A1A', letterSpacing: '0.02em', ...style }}
    >
      {children}
    </h3>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  title, value, subtitle, trend, icon: Icon, iconColor, iconBg, testId, onClick, highlight,
}: {
  title: string; value: string | number; subtitle: string;
  trend?: { value: string; positive: boolean | null };
  icon: React.ElementType; iconColor: string; iconBg: string; testId?: string;
  onClick?: () => void; highlight?: boolean;
}) {
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Wrapper
      data-testid={testId}
      onClick={onClick}
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: '#FFFFFF',
        border: highlight ? '1.5px solid #D97706' : '1px solid #E5E7EB',
        textAlign: 'left',
        width: '100%',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center rounded-xl"
          style={{ width: 40, height: 40, background: iconBg }}
        >
          <Icon size={19} style={{ color: iconColor }} />
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full"
            style={{
              background: trend.positive === true ? '#ECFDF5' : trend.positive === false ? '#FEF2F2' : '#F9F7F3',
              color: trend.positive === true ? '#065F46' : trend.positive === false ? '#B91C1C' : '#6B7280',
            }}
          >
            {trend.positive === true && <TrendingUp size={11} />}
            {trend.positive === false && <TrendingDown size={11} />}
            {trend.positive === null && <Minus size={11} />}
            <span style={{ fontSize: 11, fontWeight: 600 }}>{trend.value}</span>
          </div>
        )}
      </div>
      <div>
        <p style={{ color: '#1A1A1A', fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 500, marginTop: 4 }}>{title}</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{subtitle}</p>
      </div>
    </Wrapper>
  );
}

// ─── "Non confirmées" modal ────────────────────────────────────────────────
// Lists exactly the staff members counted in the "Non confirmées" KPI —
// `entries` is `nonConfirmedEligibleEntries(presence)`, the same helper
// (team.api.ts) the "Présences" tab's own bulk-confirm button is built
// from, applied to the exact same `presence` object the KPI's own count
// comes from (via `summarizeDailyPresence`). No second fetch, no
// re-derived predicate — see DirectorDashboard's `presence` state.
//
// "Confirmer" never confirms anything itself (that stays DIRECTOR-only,
// same permissions, same workflow, on the "Présences" tab) — it navigates
// there with today's date (the tab's own default) and the person's name
// pre-filled into the search box, so they're the only row showing and
// ready for the existing Présent/Absent buttons.

function NonConfirmedModal({ entries, onClose }: {
  entries: ApiDailyPresenceEntry[];
  onClose: () => void;
}) {
  const navigate = useNavigate();

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
            Présences non confirmées ({entries.length})
          </h3>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-2">
          {entries.length === 0 ? (
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
                      {/* Job title — team/service isn't part of the daily-presence
                          payload (only staffId/firstName/lastName/role/onLeave/
                          status), so it's omitted rather than fetched separately —
                          see the module docstring on why this never issues a
                          second query. */}
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

// ─── Demandes à traiter ─────────────────────────────────────────────────────
// Incidents needing the Director's attention: still open (status !==
// RESOLU — there is no "archived" incident status in this system, so
// "not archived" is already satisfied by that same check), reusing the
// unmodified GET /incidents endpoint (incidentsApi.list) — no new backend
// route, no re-implementation of incident business logic. Sorting and
// filtering below are purely client-side presentation over that same data.
// "Voir" reuses IncidentsPage's own existing detail modal — it navigates
// to /app/incidents?open=<id>, which auto-opens that exact modal (see
// IncidentsPage's own `open` query-param handling) rather than building a
// second detail screen.

function attentionIncidentSort(a: ApiIncident, b: ApiIncident): number {
  const aSupervisor = a.createdBy?.role === 'SUPERVISOR' ? 0 : 1;
  const bSupervisor = b.createdBy?.role === 'SUPERVISOR' ? 0 : 1;
  if (aSupervisor !== bSupervisor) return aSupervisor - bSupervisor;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function AttentionIncidentCard({ incident }: { incident: ApiIncident }) {
  const navigate = useNavigate();
  const isSupervisorCreated = incident.createdBy?.role === 'SUPERVISOR';
  const statusStyle = INCIDENT_STATUS_STYLE[incident.status];
  const priorityStyle = INCIDENT_PRIORITY_STYLE[incident.priority];
  const concerned = incidentConcernedSummary(incident);
  const createdAt = new Date(incident.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div data-testid={`attention-incident-${incident.id}`} className="rounded-xl p-4"
      style={{ background: '#FFFFFF', border: `1px solid ${isSupervisorCreated ? '#FED7AA' : '#E5E7EB'}` }}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="px-2 py-0.5 rounded-full" title={INCIDENT_PRIORITY_LABELS[incident.priority]}
              style={{ background: priorityStyle.bg, color: priorityStyle.color, fontSize: 10, fontWeight: 700 }}>
              {INCIDENT_PRIORITY_BADGE_LABELS[incident.priority]}
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
              <AlertCircle size={10} /> {INCIDENT_STATUS_LABELS[incident.status].toUpperCase()}
            </span>
            {isSupervisorCreated && (
              <span data-testid={`attention-incident-supervisor-badge-${incident.id}`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: '#FFF7ED', color: '#C2410C', fontSize: 10, fontWeight: 700 }}>
                <ShieldAlert size={10} /> Créé par le superviseur
              </span>
            )}
          </div>
          <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{incident.title}</p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
            Créé par {incident.createdBy?.name ?? incident.signaledBy} · {createdAt}
          </p>
          {concerned && <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>{concerned}</p>}
          {incident.description && (
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }} className="line-clamp-2">
              {incident.description}
            </p>
          )}
        </div>
        <button
          data-testid={`attention-incident-voir-${incident.id}`}
          onClick={() => navigate(`/app/incidents?open=${incident.id}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0 self-end sm:self-auto"
          style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Eye size={13} /> Voir
        </button>
      </div>
    </div>
  );
}

function DemandesATraiter({ incidents, loading }: { incidents: ApiIncident[]; loading: boolean }) {
  const active = incidents.filter(i => i.status !== 'RESOLU').sort(attentionIncidentSort);

  return (
    <div>
      <SectionTitle testId="section-title-demandes-a-traiter" style={{ marginBottom: 10 }}>
        DEMANDES À TRAITER
      </SectionTitle>
      {loading ? (
        // Distinct from the real empty state below — avoids claiming
        // "Aucune demande en cours." before the fetch has even resolved.
        <div data-testid="demandes-a-traiter-loading" className="rounded-xl py-8 text-center" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      ) : active.length === 0 ? (
        <div data-testid="demandes-a-traiter-empty" className="rounded-xl py-8 text-center" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <CheckCircle2 size={22} style={{ color: '#065F46', margin: '0 auto 8px' }} />
          <p style={{ color: '#6B7280', fontSize: 13 }}>Aucune demande en cours.</p>
        </div>
      ) : (
        <div data-testid="demandes-a-traiter" className="space-y-3">
          {active.map(incident => <AttentionIncidentCard key={incident.id} incident={incident} />)}
        </div>
      )}
    </div>
  );
}

// ─── Recent Activity ──────────────────────────────────────────────────────────
// Director Dashboard cleanup: only rejected and pending expenses are shown
// here now — every other activity kind (approved/completed expenses,
// maintenance) has been deliberately dropped, per the current spec.

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

  // Finance KPIs / Recent Activity data. All values are read from existing,
  // unmodified APIs (finances dashboard + DEPENSE transactions) — every
  // number below is a client-side sum/filter over that data, never a
  // reimplementation of backend budget or workflow logic.
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
  const [expenses, setExpenses] = useState<ApiTransaction[]>([]);
  const [loadingFinanceData, setLoadingFinanceData] = useState(true);

  // Staff attendance for today — same daily-presence API and the same
  // summarizeDailyPresence() tally used by the "Présences" tab of Mon
  // équipe, so the counts never diverge between the two places.
  const [presence, setPresence] = useState<ApiDailyPresence | null>(null);
  const [loadingPresence, setLoadingPresence] = useState(true);

  // "Demandes à traiter" — same unmodified GET /incidents (incidentsApi.
  // list) IncidentsPage itself uses; filtering/sorting into "active,
  // supervisor-created first" happens client-side in DemandesATraiter,
  // never a second incidents endpoint. loadingIncidents matters here (not
  // just cosmetic, like the other loading* flags): without it, the section
  // would render its "Aucune demande en cours." empty state for the one
  // instant before the real list arrives, then pop to full size — a
  // misleading flash of "nothing to do" and a layout shift for whatever
  // renders below it.
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  // Child attendance for today — same GET /children ChildrenPage itself
  // uses (no separate/new endpoint), mapped through the same
  // mapSummaryToChild, and tallied with the same summarizeChildAttendance
  // helper ChildrenPage's own "Présent aujourd'hui" stat card is built
  // from (../utils/childAttendance) — so these two counts can never
  // disagree with what /app/children shows for the same list. Deliberately
  // NOT the staff daily-presence model: children have no confirmation step
  // and no "Non confirmée" state, so only two cards are shown here.
  const [childrenList, setChildrenList] = useState<Array<ReturnType<typeof mapSummaryToChild>>>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    Promise.all([
      financesApi.getDashboard(),
      financesApi.listTransactions({ type: 'DEPENSE', from, to }),
    ])
      .then(([dashboardRes, expensesRes]) => {
        setDashboard(dashboardRes);
        setExpenses(expensesRes);
      })
      .catch(() => toast.error('Erreur de chargement des données du tableau de bord.'))
      .finally(() => setLoadingFinanceData(false));

    teamApi.listDailyPresence(new Date().toISOString().slice(0, 10))
      .then(setPresence)
      .catch(() => toast.error('Erreur de chargement des présences.'))
      .finally(() => setLoadingPresence(false));

    incidentsApi.list()
      .then(setIncidents)
      .catch(() => toast.error('Erreur de chargement des incidents.'))
      .finally(() => setLoadingIncidents(false));

    childrenApi.list()
      .then(data => setChildrenList(data.map(mapSummaryToChild)))
      .catch(() => toast.error('Erreur de chargement des présences enfants.'))
      .finally(() => setLoadingChildren(false));
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Finance KPI aggregates ──
  const budgetTotal     = dashboard ? dashboard.byCategory.reduce((sum, c) => sum + (c.budgetXof ?? 0), 0) : 0;
  const budgetReserved  = dashboard ? dashboard.byCategory.reduce((sum, c) => sum + c.reservedXof, 0) : 0;
  const budgetConsumed  = dashboard ? dashboard.byCategory.reduce((sum, c) => sum + c.consumedXof, 0) : 0;
  const budgetAvailable = dashboard ? dashboard.byCategory.reduce((sum, c) => sum + (c.availableXof ?? 0), 0) : 0;

  // ── Staff attendance aggregates (shared helper — see team.api.ts) ──
  const presenceSummary = presence ? summarizeDailyPresence(presence) : { present: 0, absent: 0, nonConfirmed: 0 };
  // Same `presence` object, same predicate the KPI's own count is built
  // from (see nonConfirmedEligibleEntries's docstring) — never a second
  // fetch, never a re-derived condition, so this list can never disagree
  // with `presenceSummary.nonConfirmed` above.
  const nonConfirmedEntries = presence ? nonConfirmedEligibleEntries(presence) : [];

  // ── Child attendance aggregate (shared helper — see ../utils/childAttendance) ──
  // Every effectively-active child is counted as exactly PRESENT or ABSENT —
  // no third "unconfirmed" bucket, no confirmation step.
  const childPresenceSummary = summarizeChildAttendance(childrenList);

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

  // 'NON_CONFIRMED' no longer navigates directly — that KPI opens
  // `NonConfirmedModal` instead (below), whose own "Confirmer" button is
  // what navigates onward, one specific person at a time.
  const goToAttendance = (status: 'PRESENT' | 'ABSENT') =>
    navigate(`/app/team?tab=attendance&status=${status}`);

  // Children attendance is a filter on the existing /app/children page, not
  // a separate route — same reasoning as goToAttendance above, just against
  // ChildrenPage's own `?attendance=present|absent` deep-link.
  const goToChildAttendance = (status: 'present' | 'absent') =>
    navigate(`/app/children?attendance=${status}`);

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1400 }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
            Bonjour, {user?.name.split(' ')[0]} 👋
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
            {today} · Vue globale Hadoum
          </p>
        </div>
      </div>

      {/* ── Quick actions (first content block below the header) ── */}
      <QuickActions onAddChild={() => setShowAddChild(true)} />

      {/* ── Demandes à traiter ── */}
      <DemandesATraiter incidents={incidents} loading={loadingIncidents} />

      {/* ── Finance KPIs ── */}
      <div>
        <SectionTitle testId="section-title-finances" style={{ marginBottom: 10 }}>
          FINANCES
        </SectionTitle>
        <div data-testid="finance-kpis" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard testId="kpi-budget-total"     title="Budget total"      value={loadingFinanceData ? '—' : formatXof(budgetTotal)}     subtitle="Toutes catégories · mois en cours" icon={DollarSign}   iconColor="#3E5A78" iconBg="#EEF2F7" />
          <KPICard testId="kpi-budget-reserved"  title="Budget réservé"    value={loadingFinanceData ? '—' : formatXof(budgetReserved)}  subtitle="Dépenses approuvées non clôturées" icon={Clock}        iconColor="#D97706" iconBg="#FFFBEB" />
          <KPICard testId="kpi-budget-consumed"  title="Budget consommé"   value={loadingFinanceData ? '—' : formatXof(budgetConsumed)}  subtitle="Dépenses clôturées ce mois"        icon={TrendingDown} iconColor="#374151" iconBg="#F3F4F6" />
          <KPICard testId="kpi-budget-available" title="Budget disponible" value={loadingFinanceData ? '—' : formatXof(budgetAvailable)} subtitle="Restant à engager"                  icon={Wallet}       iconColor="#065F46" iconBg="#ECFDF5" />
        </div>
      </div>

      {/* ── Présence de l'équipe (team attendance) ── */}
      <div>
        <SectionTitle testId="section-title-presence-equipe" style={{ marginBottom: 10 }}>
          PRÉSENCE DE L'ÉQUIPE
        </SectionTitle>
        <div data-testid="team-presence-kpis" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            testId="kpi-presence-present"
            title="Présents" value={loadingPresence ? '—' : presenceSummary.present} subtitle="Aujourd'hui"
            icon={UserCheck} iconColor="#065F46" iconBg="#ECFDF5"
            onClick={() => goToAttendance('PRESENT')}
          />
          <KPICard
            testId="kpi-presence-absent"
            title="Absents" value={loadingPresence ? '—' : presenceSummary.absent} subtitle="Aujourd'hui"
            icon={UserX} iconColor="#B91C1C" iconBg="#FEF2F2"
            onClick={() => goToAttendance('ABSENT')}
          />
          <KPICard
            testId="kpi-presence-non-confirmed"
            title="Non confirmées" value={loadingPresence ? '—' : presenceSummary.nonConfirmed} subtitle="Aujourd'hui"
            icon={Circle}
            iconColor={presenceSummary.nonConfirmed > 0 ? '#D97706' : '#6B7280'}
            iconBg={presenceSummary.nonConfirmed > 0 ? '#FFFBEB' : '#F3F4F6'}
            highlight={presenceSummary.nonConfirmed > 0}
            onClick={loadingPresence ? undefined : () => setShowNonConfirmed(true)}
          />
        </div>
      </div>

      {/* ── Présence des enfants (child attendance) ──
          Deliberately two cards only (Présents/Absents) — children have no
          "Non confirmée" state, see ../utils/childAttendance's docstring. */}
      <div>
        <SectionTitle testId="section-title-presence-enfants" style={{ marginBottom: 10 }}>
          PRÉSENCE DES ENFANTS
        </SectionTitle>
        <div data-testid="child-presence-kpis" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KPICard
            testId="kpi-child-presence-present"
            title="Présents" value={loadingChildren ? '—' : childPresenceSummary.present} subtitle="Aujourd'hui"
            icon={UserCheck} iconColor="#065F46" iconBg="#ECFDF5"
            onClick={() => goToChildAttendance('present')}
          />
          <KPICard
            testId="kpi-child-presence-absent"
            title="Absents" value={loadingChildren ? '—' : childPresenceSummary.absent} subtitle="Aujourd'hui"
            icon={UserX} iconColor="#B91C1C" iconBg="#FEF2F2"
            onClick={() => goToChildAttendance('absent')}
          />
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <RecentActivity items={recentActivity} />

      <div style={{ height: 24 }} />

      {showNonConfirmed && (
        <NonConfirmedModal entries={nonConfirmedEntries} onClose={() => setShowNonConfirmed(false)} />
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
