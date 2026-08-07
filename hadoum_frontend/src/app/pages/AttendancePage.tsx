import { useState } from 'react';
import { useSearchParams, Navigate } from 'react-router';
import { teamMembers, allChildrenData } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { Circle, Check, Users, UserCheck } from 'lucide-react';

// ─── Educator view (children presence — unrelated to this PR, untouched) ──────

function EducatorView() {
  const { user } = useAuth();
  const [presentMap, setPresentMap] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState(false);

  // Find educator's classes
  const educator = teamMembers.find(m => m.name === user?.name);
  const educatorClasses = educator?.classes ?? [];
  // Normalize: 'Primaire 2A' → 'Primaire 2'
  const normalizedClasses = educatorClasses.map(c => c.replace(/\s+[A-Z]$/, '').trim());

  const myChildren = allChildrenData.filter(c => normalizedClasses.includes(c.classe));

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const presentCount = myChildren.filter(c => presentMap[c.id] ?? false).length;

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 900 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Présences des élèves</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {educatorClasses.length > 0
              ? `Classes : ${educatorClasses.join(', ')} — ${today}`
              : today}
          </p>
        </div>
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start sm:self-auto transition-all"
          style={{ background: saved ? '#065F46' : '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          {saved ? <><Check size={14} /> Sauvegardé</> : <>Valider les présences</>}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#EEF2F7' }}>
          <Users size={16} style={{ color: '#3E5A78' }} />
          <div>
            <p style={{ color: '#3E5A78', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{myChildren.length}</p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Total élèves</p>
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#ECFDF5' }}>
          <UserCheck size={16} style={{ color: '#065F46' }} />
          <div>
            <p style={{ color: '#065F46', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{presentCount}</p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Présents</p>
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#F3F4F6' }}>
          <Circle size={16} style={{ color: '#9CA3AF' }} />
          <div>
            <p style={{ color: '#374151', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{myChildren.length - presentCount}</p>
            <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Non confirmés</p>
          </div>
        </div>
      </div>

      {myChildren.length === 0 ? (
        <div className="py-12 text-center rounded-xl" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun élève trouvé pour vos classes.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="grid px-5 py-3"
            style={{ gridTemplateColumns: '2fr 1fr 1fr', background: '#F9F7F3', borderBottom: '1px solid #F3F4F6' }}>
            {['PRÉNOM + NOM', 'CLASSE', 'PRÉSENT'].map(h => (
              <span key={h} style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          {myChildren.map((child, i) => {
            const present = presentMap[child.id] ?? false;
            const isLast = i === myChildren.length - 1;
            return (
              <div key={child.id} className="grid items-center px-5 py-3.5"
                style={{
                  gridTemplateColumns: '2fr 1fr 1fr',
                  borderBottom: isLast ? 'none' : '1px solid #F9F7F3',
                  background: present ? 'rgba(6,95,70,0.03)' : '#FFFFFF',
                }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ width: 32, height: 32, background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700 }}>
                    {child.firstName[0]}{child.lastName[0]}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{child.firstName} {child.lastName}</p>
                </div>
                <p style={{ color: '#6B7280', fontSize: 12 }}>{child.classe}</p>
                <div>
                  <div className="flex items-center justify-center rounded flex-shrink-0 cursor-pointer"
                    style={{ width: 20, height: 20, background: present ? '#065F46' : '#FFFFFF', border: `1.5px solid ${present ? '#065F46' : '#D1D5DB'}` }}
                    onClick={() => setPresentMap(prev => ({ ...prev, [child.id]: !present }))}>
                    {present && <Check size={12} style={{ color: '#FFFFFF' }} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AttendancePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  if (user?.role === 'educator') return <EducatorView />;
  // DIRECTOR/SUPERVISOR staff presence confirmation now lives inside the
  // "Présences" tab of "Mon équipe" (Team navigation update) — this route
  // is kept only so old bookmarks/links redirect there instead of breaking,
  // preserving a status filter if one was present.
  const status = searchParams.get('status');
  const target = status ? `/app/team?tab=attendance&status=${status}` : '/app/team?tab=attendance';
  return <Navigate to={target} replace />;
}
