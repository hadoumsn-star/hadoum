import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AddModal } from './ChildrenPage';
import {
  Users, UserCheck, GraduationCap, TrendingUp, TrendingDown,
  AlertCircle, AlertTriangle, X, ArrowRight, Plus, CalendarCheck,
  FileText, Clock, CheckCircle2, Circle, ChevronRight,
  Minus, ChevronDown, DollarSign, XCircle, Send,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  staffAttendanceData, classDistributionData,
  activeAlerts, priorityTasks, teamMembers,
} from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';

// ─── Attendance Inconsistency Badge ──────────────────────────────────────────

function AttendanceBadge() {
  const { teamAttendanceConfirmed } = useAppData();
  const inconsistencies = teamMembers.filter(m => {
    const confirmed = teamAttendanceConfirmed[m.id] ?? false;
    return (m.status === 'present' && !confirmed) ||
           ((m.status === 'absent' || m.status === 'conge') && confirmed);
  }).length;
  if (inconsistencies === 0) return null;
  return (
    <span
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{ minWidth: 20, height: 20, background: '#B91C1C', color: '#FFFFFF', fontSize: 11, fontWeight: 700, padding: '0 5px' }}
    >
      {inconsistencies}
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  title, value, subtitle, trend, icon: Icon, iconColor, iconBg,
}: {
  title: string; value: string | number; subtitle: string;
  trend?: { value: string; positive: boolean | null };
  icon: React.ElementType; iconColor: string; iconBg: string;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
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
        <p style={{ color: '#1A1A1A', fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 500, marginTop: 4 }}>{title}</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Compact Alerts Bar ───────────────────────────────────────────────────────
// Max 1 line visible, +N autres se déploient en accordéon

// Routing par type d'alerte
function getAlertRoute(alert: typeof activeAlerts[0]): string {
  const t = (alert.title + ' ' + alert.description).toLowerCase();
  if (t.includes('dossier') || t.includes('médical') || t.includes('enfant')) return '/app/children';
  if (t.includes('rapport') || t.includes('document') || t.includes('déclaration')) return '/app/reports';
  if (t.includes('éducateur') || t.includes('absence') || t.includes('équipe') || t.includes('congé') || t.includes('planning')) return '/app/team';
  return '/app/reports';
}

function CompactAlertsBar({
  alerts,
  onDismiss,
}: {
  alerts: typeof activeAlerts;
  onDismiss: (id: number) => void;
}) {
  const [extraOpen, setExtraOpen] = useState(false);
  const navigate = useNavigate();

  if (alerts.length === 0) return null;

  const primary = alerts[0];
  const rest    = alerts.slice(1);
  const isError = primary.level === 'error';

  return (
    <div className="space-y-1.5">
      {/* Primary alert — 1 line */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
        style={{
          background: isError ? '#FEF2F2' : '#FFFBEB',
          border: `1px solid ${isError ? '#FECACA' : '#FDE68A'}`,
        }}
      >
        {isError
          ? <AlertCircle size={15} style={{ color: '#B91C1C', flexShrink: 0 }} />
          : <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0 }} />
        }
        <p className="flex-1 min-w-0" style={{ color: '#1A1A1A', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <strong>{primary.title}</strong>
          <span style={{ color: '#6B7280' }}> — {primary.description.slice(0, 55)}{primary.description.length > 55 ? '…' : ''}</span>
        </p>
        <button
          onClick={() => navigate(getAlertRoute(primary))}
          className="flex items-center gap-1 flex-shrink-0"
          style={{ color: isError ? '#B91C1C' : '#D97706', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {primary.action} <ArrowRight size={11} />
        </button>
        {rest.length > 0 && (
          <button
            onClick={() => setExtraOpen(!extraOpen)}
            className="flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full"
            style={{ background: '#FFFFFF', color: '#6B7280', fontSize: 11, fontWeight: 600, border: '1px solid #E5E7EB' }}
          >
            +{rest.length} <ChevronDown size={10} style={{ transform: extraOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 150ms' }} />
          </button>
        )}
        <button onClick={() => onDismiss(primary.id)} className="flex-shrink-0 p-1 rounded-md hover:bg-black/5">
          <X size={13} style={{ color: '#9CA3AF' }} />
        </button>
      </div>

      {/* Extra alerts */}
      {extraOpen && rest.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-3 px-4 py-2 rounded-xl ml-6"
          style={{
            background: alert.level === 'error' ? '#FEF2F2' : '#FFFBEB',
            border: `1px solid ${alert.level === 'error' ? '#FECACA' : '#FDE68A'}`,
          }}
        >
          {alert.level === 'error'
            ? <AlertCircle size={13} style={{ color: '#B91C1C', flexShrink: 0 }} />
            : <AlertTriangle size={13} style={{ color: '#D97706', flexShrink: 0 }} />
          }
          <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 12 }}>
            <strong>{alert.title}</strong>
          </p>
          <button
            onClick={() => navigate(getAlertRoute(alert))}
            style={{ color: alert.level === 'error' ? '#B91C1C' : '#D97706', fontSize: 11, fontWeight: 600, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {alert.action} <ArrowRight size={10} />
          </button>
          <button onClick={() => onDismiss(alert.id)} className="flex-shrink-0 p-1 rounded-md hover:bg-black/5">
            <X size={12} style={{ color: '#9CA3AF' }} />
          </button>
        </div>
      ))}

      {/* Bouton "Voir toutes les notifications" — style secondaire 13px, bleu primaire */}
      <div className="flex justify-end pt-1">
        <button
          onClick={() => navigate('/app/incidents')}
          className="hover:underline"
          style={{ color: '#1E3A8A', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Voir toutes les notifications
        </button>
      </div>
    </div>
  );
}

// ─── Priority Tasks ───────────────────────────────────────────────────────────

function PriorityTasks() {
  const [checked, setChecked] = useState<number[]>([]);
  const toggle = (id: number) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const remaining = priorityTasks.length - checked.length;

  return (
    <div className="rounded-xl flex flex-col h-full" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Tâches à faire</h3>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
          {remaining > 0 ? `${remaining} tâche${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}` : '✓ Tout est fait'}
        </p>
      </div>
      <ul className="divide-y px-5 flex-1" style={{ borderColor: '#F9F7F3' }}>
        {priorityTasks.map((task) => {
          const isDone = checked.includes(task.id);
          return (
            <li key={task.id} className="flex items-center gap-3 py-3">
              <button onClick={() => toggle(task.id)} className="flex-shrink-0">
                {isDone
                  ? <CheckCircle2 size={18} style={{ color: '#065F46' }} />
                  : <Circle size={18} style={{ color: '#D1D5DB' }} />
                }
              </button>
              <p className="flex-1 min-w-0" style={{ color: isDone ? '#9CA3AF' : '#1A1A1A', fontSize: 13, textDecoration: isDone ? 'line-through' : 'none' }}>
                {task.task}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                {task.status === 'urgent' && !isDone && (
                  <span className="px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 10, fontWeight: 600 }}>
                    URGENT
                  </span>
                )}
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{task.dueDate}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions({ onAddChild }: { onAddChild: () => void }) {
  const navigate = useNavigate();

  const actions = [
    { label: 'Ajouter un enfant', icon: Plus,          color: '#3E5A78', bg: '#EEF2F7', desc: 'Nouveau dossier',    onClick: onAddChild },
    { label: 'Saisir présences',  icon: CalendarCheck, color: '#065F46', bg: '#ECFDF5', desc: 'Pointage du jour',   onClick: () => navigate('/app/attendance') },
    { label: 'Générer un rapport',icon: FileText,      color: '#7C3AED', bg: '#F5F3FF', desc: 'PDF / Export',       onClick: () => navigate('/app/reports') },
  ];

  return (
    <div>
      <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 10 }}>
        ACTIONS RAPIDES
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
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

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg px-3 py-2 shadow-lg" style={{ background: '#1A1A1A' }}>
        <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: '#FFFFFF', fontSize: 13 }}>
            {p.dataKey === 'presents' ? 'Présents' : p.dataKey === 'absents' ? 'Absents' : p.dataKey}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// ─── Activités à valider ──────────────────────────────────────────────────────

function ActivitesAValider() {
  const { pendingActivities, validateActivity, refuseActivity } = useAppData();
  const [refuseTarget, setRefuseTarget] = useState<number | null>(null);
  const [motifRefus, setMotifRefus]     = useState('');

  const toValidate = pendingActivities.filter(a => a.status === 'en attente');

  if (toValidate.length === 0) return null;

  return (
    <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <Circle size={14} style={{ color: '#D97706' }} />
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>
          Activités à valider
          <span className="ml-2 px-2 py-0.5 rounded-full" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 10, fontWeight: 700 }}>
            {toValidate.length}
          </span>
        </h3>
      </div>
      <ul>
        {toValidate.map((a, i) => (
          <li key={a.id} className="flex items-center gap-4 px-5 py-4"
            style={{ borderBottom: i < toValidate.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
            <div className="flex-1 min-w-0">
              <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{a.title}</p>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>{a.educator} · {a.class} · {a.date}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => validateActivity(a.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <CheckCircle2 size={13} /> Valider
              </button>
              <button onClick={() => setRefuseTarget(a.id)}
                className="p-1.5 rounded-lg"
                style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }} title="Refuser">
                <XCircle size={15} style={{ color: '#6B7280' }} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Refus modale */}
      {refuseTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setRefuseTarget(null); }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Refuser l'activité</h3>
              <button onClick={() => setRefuseTarget(null)}><X size={18} style={{ color: '#9CA3AF' }} /></button>
            </div>
            <div className="px-6 py-5">
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif de refus *</label>
              <textarea value={motifRefus} onChange={e => setMotifRefus(e.target.value)} rows={3}
                placeholder="Expliquez le motif de refus…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setRefuseTarget(null)} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
              <button disabled={!motifRefus.trim()}
                onClick={() => { if (motifRefus.trim()) { refuseActivity(refuseTarget, motifRefus); setRefuseTarget(null); setMotifRefus(''); } }}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: motifRefus.trim() ? '#B91C1C' : '#E5E7EB', color: motifRefus.trim() ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: motifRefus.trim() ? 'pointer' : 'not-allowed' }}>
                Refuser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Demandes RH en attente ───────────────────────────────────────────────────

function DemandesRH() {
  const { leaveRequests, validateLeave, refuseLeave } = useAppData();
  const pending = leaveRequests.filter(r => r.status === 'en attente');

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <Users size={14} style={{ color: '#7C3AED' }} />
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>
          Demandes RH
          <span className="ml-2 px-2 py-0.5 rounded-full" style={{ background: '#F5F3FF', color: '#7C3AED', fontSize: 10, fontWeight: 700 }}>
            {pending.length}
          </span>
        </h3>
      </div>
      <ul>
        {pending.map((r, i) => (
          <li key={r.id} className="flex items-center gap-4 px-5 py-3.5"
            style={{ borderBottom: i < pending.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
            <div className="flex-1 min-w-0">
              <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{r.type} — {r.educator}</p>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>{r.dateFrom}{r.dateTo ? ` → ${r.dateTo}` : ''} · {r.motif}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => validateLeave(r.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <CheckCircle2 size={13} /> Valider
              </button>
              <button onClick={() => refuseLeave(r.id)} className="p-1.5 rounded-lg"
                style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
                <XCircle size={15} style={{ color: '#6B7280' }} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Demande de fonds ─────────────────────────────────────────────────────────

function DemanderFonds({ userName }: { userName: string }) {
  const { addFundRequest } = useAppData();
  const [show, setShow]     = useState(false);
  const [montant, setMontant] = useState('');
  const [motif, setMotif]     = useState('');
  const canSave = montant.trim() && motif.trim();

  if (!show) {
    return (
      <button onClick={() => setShow(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg"
        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
        <DollarSign size={14} /> Demander des fonds
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) setShow(false); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Demander des fonds</h3>
          <button onClick={() => setShow(false)}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Montant (DA) *</label>
            <input value={montant} onChange={e => setMontant(e.target.value)} placeholder="Ex : 50 000"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif *</label>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} placeholder="Justification de la demande…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={() => setShow(false)} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
          <button disabled={!canSave}
            onClick={() => { if (canSave) { addFundRequest({ montant, motif, requestedBy: userName, date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) }); setShow(false); setMontant(''); setMotif(''); } }}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Send size={13} /> Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
// Question centrale : "Tout va bien aujourd'hui ?"

export function DirectorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([]);
  const [showAddChild, setShowAddChild] = useState(false);

  const visibleAlerts = activeAlerts.filter((a) => !dismissedAlerts.includes(a.id));

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

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
        <div className="flex items-center gap-2">
          <DemanderFonds userName={user?.name ?? 'Directrice'} />
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500 }}
          >
            <FileText size={14} /> Exporter
          </button>
        </div>
      </div>

      {/* ── Compact alerts ── */}
      <CompactAlertsBar
        alerts={visibleAlerts}
        onDismiss={(id) => setDismissedAlerts((prev) => [...prev, id])}
      />

      {/* ── Activités à valider + Demandes RH (si en attente) ── */}
      <ActivitesAValider />
      <DemandesRH />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Enfants enregistrés"  value="87"     subtitle="En charge à ce jour"     trend={{ value: '+2 ce mois', positive: true }}          icon={Users}        iconColor="#3E5A78" iconBg="#EEF2F7" />
        <KPICard title="Présence aujourd'hui" value="74 / 87" subtitle="Taux : 85%"              trend={{ value: '-3% vs hier', positive: false }}        icon={UserCheck}    iconColor="#065F46" iconBg="#ECFDF5" />
        <KPICard title="Éducateurs actifs"    value="12 / 14" subtitle="2 en congé"             trend={{ value: 'Stable', positive: null }}              icon={GraduationCap} iconColor="#7C3AED" iconBg="#F5F3FF" />
        <KPICard title="Budget consommé"      value="82%"    subtitle="18% restant ce mois"      trend={{ value: '+4% vs dernier', positive: false }}     icon={TrendingUp}   iconColor="#D97706" iconBg="#FFFBEB" />
      </div>

      {/* ── Quick actions ── */}
      <QuickActions onAddChild={() => setShowAddChild(true)} />

      {/* ── Row : Présences équipe + Tâches ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Staff attendance chart — Point 8a */}
        <div className="lg:col-span-3 rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Présences équipe aujourd'hui</h3>
                <AttendanceBadge />
              </div>
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Éducateurs et personnel — semaine en cours</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#3E5A78' }} />
                <span style={{ color: '#6B7280', fontSize: 11 }}>Présents</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#FECACA' }} />
                <span style={{ color: '#6B7280', fontSize: 11 }}>Absents</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={staffAttendanceData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis key="xaxis" dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis key="yaxis" domain={[0, 14]} tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip key="tooltip" content={<CustomTooltip />} cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }} />
              <Area key="area-presents" type="monotone" dataKey="presents" stroke="#3E5A78" strokeWidth={2.5}
                fill="#3E5A78" fillOpacity={0.1}
                dot={{ fill: '#3E5A78', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#3E5A78' }} isAnimationActive={false} />
              <Area key="area-absents" type="monotone" dataKey="absents" stroke="#B91C1C" strokeWidth={1.5}
                fill="#B91C1C" fillOpacity={0.07}
                dot={{ fill: '#B91C1C', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#B91C1C' }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Priority tasks */}
        <div className="lg:col-span-2">
          <PriorityTasks />
        </div>
      </div>

      {/* ── Row : Répartition par classe ── */}
      <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Répartition par classe</h3>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>87 enfants · 5 niveaux</p>
          </div>
          <button
            onClick={() => navigate('/app/children')}
            className="flex items-center gap-1"
            style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Voir les enfants <ChevronRight size={13} />
          </button>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={classDistributionData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis key="xaxis" type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 30]} />
            <YAxis key="yaxis" type="category" dataKey="classe" tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
            <Tooltip key="tooltip" content={<CustomTooltip />} cursor={{ fill: '#F3F4F6' }} />
            <Bar key="bar-effectif" dataKey="effectif" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
              {classDistributionData.map((entry, i) => (
                <Cell key={`dir-class-cell-${entry.classe}`} fill={['#3E5A78', '#4A6A8A', '#56789A', '#6286A8', '#6E94B6'][i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ height: 24 }} />

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