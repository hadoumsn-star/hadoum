import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { myClasses, todaySchedule } from '../data/mockData';
import {
  BookOpen, CalendarCheck, Plus, Bell, MessageSquare,
  ChevronRight, Edit3, Clock, UserCheck, ChevronDown,
  FileText, Briefcase, AlertTriangle, Check, X,
} from 'lucide-react';

// ─── Context Banner — "Que fais-je maintenant ?" ──────────────────────────────

function ContextBanner() {
  const currentSession = todaySchedule.find((s) => s.status === 'current');
  const nextSession    = todaySchedule.find((s) => s.status === 'upcoming');

  if (currentSession) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 rounded-xl"
        style={{ background: '#EEF2F7', border: '1px solid #BFCFDF' }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#3E5A78' }} />
            <span style={{ color: '#3E5A78', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>EN COURS</span>
          </div>
          <div className="min-w-0">
            <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 700 }}>{currentSession.activity}</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>
              {currentSession.class} · {currentSession.time}
              {nextSession && <span> · Prochaine : {nextSession.activity} à {nextSession.time}</span>}
            </p>
          </div>
        </div>
        <Link
          to="/app/attendance"
          className="flex items-center gap-2 px-4 py-2 rounded-lg flex-shrink-0"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          <CalendarCheck size={14} /> Saisir les présences
        </Link>
      </div>
    );
  }

  if (nextSession) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 rounded-xl"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Clock size={18} style={{ color: '#D97706', flexShrink: 0 }} />
          <div>
            <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 700 }}>Prochaine : {nextSession.activity}</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>{nextSession.class} · {nextSession.time}</p>
          </div>
        </div>
        <Link to="/app/classes"
          className="flex items-center gap-2 px-4 py-2 rounded-lg flex-shrink-0"
          style={{ background: '#D97706', color: '#FFFFFF', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Préparer <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-xl" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
      <div className="flex-1">
        <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 700 }}>Journée terminée</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>Pensez à valider toutes les présences avant de partir.</p>
      </div>
      <Link to="/app/attendance"
        className="flex items-center gap-2 px-4 py-2 rounded-lg flex-shrink-0"
        style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
        <UserCheck size={14} /> Valider
      </Link>
    </div>
  );
}

// ─── Schedule status badge ────────────────────────────────────────────────────

function ScheduleStatus({ status }: { status: 'done' | 'current' | 'upcoming' }) {
  if (status === 'done')
    return <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>TERMINÉ</span>;
  if (status === 'current')
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 10, fontWeight: 600 }}>
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#3E5A78' }} />
        EN COURS
      </span>
    );
  return <span className="px-2 py-0.5 rounded-full" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 10, fontWeight: 600 }}>À VENIR</span>;
}

// ─── Quick actions ────────────────────────────────────────────────────────────

const EDUCATOR_ACTIONS = [
  { label: 'Saisir présences',  desc: 'Pointage du jour',   icon: CalendarCheck, color: '#3E5A78', bg: '#EEF2F7' },
  { label: 'Nouvelle activité', desc: 'Créer une activité', icon: Plus,          color: '#065F46', bg: '#ECFDF5' },
];

// ─── Formulaire demande congé/absence ─────────────────────────────────────────

const INPUT_S: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function DemandeModal({ type, authorName, onSave, onClose }: {
  type: 'congé' | 'absence';
  authorName: string;
  onSave: (dateFrom: string, dateTo: string, motif: string) => void;
  onClose: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [motif, setMotif]       = useState('');
  const canSave = dateFrom && motif;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>
            {type === 'congé' ? 'Demande de congé' : 'Justifier une absence'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              {type === 'congé' ? 'Date de début *' : 'Date *'}
            </label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={INPUT_S} />
          </div>
          {type === 'congé' && (
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de fin</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={INPUT_S} />
            </div>
          )}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif *</label>
            <textarea value={motif} onChange={e => setMotif(e.target.value)}
              rows={3} placeholder={type === 'congé' ? 'Congé annuel, motif personnel…' : 'Raison de l\'absence…'}
              style={{ ...INPUT_S, resize: 'none' }} />
          </div>
          {type === 'absence' && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
              <FileText size={14} style={{ color: '#9CA3AF' }} />
              <span style={{ color: '#6B7280', fontSize: 12 }}>Certificat médical (simulé)</span>
              <button className="ml-auto px-2 py-1 rounded" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                Joindre
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={() => canSave && onSave(dateFrom, dateTo, motif)}
            className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Mes Demandes ──────────────────────────────────────────────────────

function MesDemandes({ authorName }: { authorName: string }) {
  const { leaveRequests, addLeaveRequest } = useAppData();
  const [showModal, setShowModal] = useState<'congé' | 'absence' | null>(null);

  const myRequests = leaveRequests.filter(r => r.educator === authorName);

  const STATUS_CFG = {
    'en attente': { bg: '#FFFBEB', color: '#D97706', label: 'En attente' },
    'validé':     { bg: '#ECFDF5', color: '#065F46', label: 'Validé' },
    'refusé':     { bg: '#FEF2F2', color: '#B91C1C', label: 'Refusé' },
  };

  return (
    <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Mes demandes</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModal('congé')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Briefcase size={12} /> Congé
          </button>
          <button onClick={() => setShowModal('absence')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <AlertTriangle size={12} /> Absence
          </button>
        </div>
      </div>

      {myRequests.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune demande envoyée.</p>
        </div>
      ) : (
        <ul>
          {myRequests.slice(0, 3).map((r, i) => {
            const st = STATUS_CFG[r.status];
            return (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3"
                style={{ borderBottom: i < Math.min(myRequests.length, 3) - 1 ? '1px solid #F9F7F3' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{r.type} · {r.dateFrom}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{r.motif}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                  {st.label.toUpperCase()}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showModal && (
        <DemandeModal
          type={showModal}
          authorName={authorName}
          onSave={(dateFrom, dateTo, motif) => {
            addLeaveRequest({ educator: authorName, type: showModal, dateFrom, dateTo, motif });
            setShowModal(null);
          }}
          onClose={() => setShowModal(null)}
        />
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
// Question centrale : "Que fais-je maintenant ?"

export function EducatorDashboard() {
  const { user } = useAuth();
  const [newObs, setNewObs] = useState('');
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [scheduleClassFilter, setScheduleClassFilter] = useState<string>('Toutes');

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalStudents = myClasses.reduce((s, c) => s + c.students, 0);
  const totalPresent  = myClasses.reduce((s, c) => s + c.presentToday, 0);

  const scheduleClasses = ['Toutes', ...Array.from(new Set(todaySchedule.map((s) => s.class)))];
  const filteredSchedule = scheduleClassFilter === 'Toutes'
    ? todaySchedule
    : todaySchedule.filter((s) => s.class === scheduleClassFilter);

  const visibleSchedule = scheduleExpanded
    ? filteredSchedule
    : filteredSchedule.filter((s) => s.status === 'current' || s.status === 'upcoming').slice(0, 2);

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Bonjour, {user?.name.split(' ')[0]} 👋</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
          {today} · {user?.title}
        </p>
      </div>

      {/* ── Context banner ── */}
      <ContextBanner />

      {/* ── Quick actions ── */}
      <div>
        <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 10 }}>
          ACTIONS RAPIDES
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EDUCATOR_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                className="flex items-center gap-3 px-4 py-4 rounded-xl transition-all hover:shadow-md hover:-translate-y-0.5 text-left"
                style={{ background: '#FFFFFF', border: '1.5px solid #3E5A78', cursor: 'pointer' }}
              >
                <div className="flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ width: 40, height: 40, background: action.bg }}>
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

      {/* ── Row : Classes + Programme ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* My classes */}
        <div className="lg:col-span-2 order-first lg:order-last rounded-xl flex flex-col" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Mes classes</h3>
            <span style={{ color: '#6B7280', fontSize: 12 }}>{totalPresent}/{totalStudents} présents</span>
          </div>
          <ul className="flex-1">
            {myClasses.map((cls, i) => {
              const pct = Math.round((cls.presentToday / cls.students) * 100);
              return (
                <li key={cls.id} className="px-5 py-4 hover:bg-gray-50 cursor-pointer"
                  style={{ borderBottom: i < myClasses.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{cls.name}</p>
                    <span style={{ color: '#9CA3AF', fontSize: 11 }}>{cls.students} élèves</span>
                  </div>
                  <div className="relative h-1.5 rounded-full overflow-hidden mb-2" style={{ background: '#F3F4F6' }}>
                    <div className="absolute left-0 top-0 h-full rounded-full"
                      style={{ width: `${pct}%`, background: pct >= 90 ? '#065F46' : pct >= 75 ? '#3E5A78' : '#D97706' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#374151', fontSize: 11 }}>{cls.presentToday}/{cls.students} ({pct}%)</span>
                    <span style={{ color: '#6B7280', fontSize: 11 }}>{cls.nextActivity}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
            <Link to="/app/attendance"
              className="w-full py-2 rounded-lg flex items-center justify-center gap-1.5"
              style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'flex' }}>
              <CalendarCheck size={14} /> Saisir les présences
            </Link>
          </div>
        </div>

        {/* Programme du jour */}
        <div className="lg:col-span-3 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Programme du jour</h3>
            <span style={{ color: '#6B7280', fontSize: 12 }}>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <div className="px-5 py-3 overflow-x-auto" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex gap-1.5 flex-nowrap" style={{ width: 'max-content' }}>
              {scheduleClasses.map((cls) => (
                <button key={cls} onClick={() => { setScheduleClassFilter(cls); setScheduleExpanded(false); }}
                  className="px-3 py-1.5 rounded-lg flex-shrink-0 transition-all"
                  style={{ background: scheduleClassFilter === cls ? '#3E5A78' : '#F3F4F6', color: scheduleClassFilter === cls ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: scheduleClassFilter === cls ? 600 : 400, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {cls}
                </button>
              ))}
            </div>
          </div>
          <ul className="hidden lg:block">
            {filteredSchedule.length === 0 ? (
              <li className="px-5 py-6 text-center"><p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun créneau.</p></li>
            ) : filteredSchedule.map((item, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: i < filteredSchedule.length - 1 ? '1px solid #F9F7F3' : 'none', background: item.status === 'current' ? '#F0F4F8' : 'transparent' }}>
                <div className="w-12 flex-shrink-0"><span style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{item.time}</span></div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: item.status === 'current' ? 600 : 400 }}>{item.activity}</p>
                  <p style={{ color: '#6B7280', fontSize: 11 }}>{item.class}</p>
                </div>
                <ScheduleStatus status={item.status} />
              </li>
            ))}
          </ul>
          <ul className="lg:hidden">
            {visibleSchedule.map((item, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: '1px solid #F9F7F3', background: item.status === 'current' ? '#F0F4F8' : 'transparent' }}>
                <div className="w-12 flex-shrink-0"><span style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{item.time}</span></div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 13 }}>{item.activity}</p>
                  <p style={{ color: '#6B7280', fontSize: 11 }}>{item.class}</p>
                </div>
                <ScheduleStatus status={item.status} />
              </li>
            ))}
            <li className="px-5 py-3">
              <button onClick={() => setScheduleExpanded(!scheduleExpanded)}
                className="flex items-center gap-1 w-full justify-center"
                style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
                {scheduleExpanded ? 'Réduire' : `Voir tout (${filteredSchedule.length} séances)`}
                <ChevronDown size={13} style={{ transform: scheduleExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }} />
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* ── Mes demandes ── */}
      <MesDemandes authorName={user?.name ?? 'Karim Mansouri'} />

      <div style={{ height: 24 }} />
    </div>
  );
}