import { useState } from 'react';
import { teamMembers, TeamMember } from '../data/mockData';
import { useAppData } from '../context/AppDataContext';
import {
  CheckCircle2, Circle, CalendarCheck, Check, AlertTriangle,
  AlertCircle, Users, UserCheck,
} from 'lucide-react';

// Simulated : après 9h (toujours vrai à l'ouverture de la page)
const PAST_9H = true;

const STATUS_BADGE: Record<TeamMember['status'], { bg: string; color: string; label: string }> = {
  present: { bg: '#ECFDF5', color: '#065F46', label: 'Présent' },
  absent:  { bg: '#FEF2F2', color: '#B91C1C', label: 'Absent' },
  conge:   { bg: '#FFFBEB', color: '#D97706', label: 'En congé' },
};

function getAlertType(member: TeamMember, confirmed: boolean): 'non_confirmee' | 'incoherence' | null {
  if (member.status === 'present' && !confirmed && PAST_9H) return 'non_confirmee';
  if ((member.status === 'absent' || member.status === 'conge') && confirmed) return 'incoherence';
  return null;
}

export function AttendancePage() {
  const { teamAttendanceConfirmed, updateTeamAttendanceConfirmed } = useAppData();
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = teamMembers.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.role.toLowerCase().includes(search.toLowerCase())
  );

  const confirmedCount = teamMembers.filter(m => teamAttendanceConfirmed[m.id] ?? false).length;
  const alertCount = teamMembers.filter(m => {
    const conf = teamAttendanceConfirmed[m.id] ?? false;
    return getAlertType(m, conf) !== null;
  }).length;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Présences équipe</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            Pointage journalier — {today}
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start sm:self-auto transition-all"
          style={{
            background: saved ? '#065F46' : '#3E5A78',
            color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
          }}
        >
          {saved
            ? <><Check size={14} /> Sauvegardé</>
            : <><CalendarCheck size={14} /> Valider les présences équipe</>
          }
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#EEF2F7' }}>
          <Users size={16} style={{ color: '#3E5A78' }} />
          <div>
            <p style={{ color: '#3E5A78', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{teamMembers.length}</p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Total équipe</p>
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#ECFDF5' }}>
          <UserCheck size={16} style={{ color: '#065F46' }} />
          <div>
            <p style={{ color: '#065F46', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{confirmedCount}</p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Confirmés</p>
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: alertCount > 0 ? '#FEF2F2' : '#F3F4F6' }}>
          <AlertTriangle size={16} style={{ color: alertCount > 0 ? '#B91C1C' : '#9CA3AF' }} />
          <div>
            <p style={{ color: alertCount > 0 ? '#B91C1C' : '#9CA3AF', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{alertCount}</p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Incohérences</p>
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#F3F4F6' }}>
          <Circle size={16} style={{ color: '#9CA3AF' }} />
          <div>
            <p style={{ color: '#374151', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
              {teamMembers.length - confirmedCount}
            </p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Non confirmés</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative" style={{ maxWidth: 320 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un membre…"
          className="w-full pl-3 pr-8 py-2 rounded-lg outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13 }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ×
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#D97706' }} />
          <span style={{ color: '#6B7280', fontSize: 12 }}>Présence non confirmée (après 9h)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#B91C1C' }} />
          <span style={{ color: '#6B7280', fontSize: 12 }}>Incohérence (absent/congé mais coché)</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        {/* Table header */}
        <div
          className="grid gap-0 px-5 py-3"
          style={{
            gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
            background: '#F9F7F3',
            borderBottom: '1px solid #F3F4F6',
          }}
        >
          {['MEMBRE', 'STATUT DÉCLARÉ', 'PRÉSENCE CONFIRMÉE', 'ALERTE'].map(h => (
            <span key={h} style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {filtered.map((member, i) => {
          const confirmed = teamAttendanceConfirmed[member.id] ?? false;
          const alert = getAlertType(member, confirmed);
          const st = STATUS_BADGE[member.status];
          const isLast = i === filtered.length - 1;

          return (
            <div
              key={member.id}
              className="grid items-center gap-0 px-5 py-4 hover:bg-gray-50 transition-colors"
              style={{
                gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
                borderBottom: isLast ? 'none' : '1px solid #F9F7F3',
                background: alert === 'incoherence' ? 'rgba(185,28,28,0.03)' : alert === 'non_confirmee' ? 'rgba(217,119,6,0.03)' : '#FFFFFF',
              }}
            >
              {/* Membre */}
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ width: 36, height: 36, background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontWeight: 700 }}
                >
                  {member.initials}
                </div>
                <div>
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{member.name}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 11 }}>{member.role}</p>
                </div>
              </div>

              {/* Statut déclaré */}
              <div>
                <span
                  className="px-2 py-0.5 rounded-full inline-block"
                  style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}
                >
                  {st.label}
                </span>
              </div>

              {/* Présence confirmée */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer" style={{ width: 'fit-content' }}>
                  <div
                    className="flex items-center justify-center rounded flex-shrink-0"
                    style={{
                      width: 20, height: 20,
                      background: confirmed ? '#065F46' : '#FFFFFF',
                      border: `1.5px solid ${confirmed ? '#065F46' : '#D1D5DB'}`,
                      cursor: 'pointer',
                    }}
                    onClick={() => updateTeamAttendanceConfirmed(member.id, !confirmed)}
                  >
                    {confirmed && <Check size={12} style={{ color: '#FFFFFF' }} />}
                  </div>
                  <span style={{ color: confirmed ? '#065F46' : '#9CA3AF', fontSize: 12, fontWeight: confirmed ? 600 : 400 }}>
                    {confirmed ? 'Confirmé' : 'Non confirmé'}
                  </span>
                </label>
              </div>

              {/* Alerte */}
              <div>
                {alert === 'non_confirmee' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', width: 'fit-content' }}>
                    <AlertTriangle size={12} style={{ color: '#D97706' }} />
                    <span style={{ color: '#D97706', fontSize: 11, fontWeight: 600 }}>Présence non confirmée</span>
                  </div>
                )}
                {alert === 'incoherence' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: '#FEF2F2', border: '1px solid #FECACA', width: 'fit-content' }}>
                    <AlertCircle size={12} style={{ color: '#B91C1C' }} />
                    <span style={{ color: '#B91C1C', fontSize: 11, fontWeight: 600 }}>Incohérence de présence</span>
                  </div>
                )}
                {alert === null && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} style={{ color: '#065F46' }} />
                    <span style={{ color: '#9CA3AF', fontSize: 11 }}>OK</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
