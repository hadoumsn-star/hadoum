import { useState } from 'react';
import { allChildrenData, myClasses } from '../data/mockData';
import { Users, ChevronRight, X, BookOpen } from 'lucide-react';

const CLASS_LIST = [
  { id: 1, name: 'Maternelle',  educator: 'Zineb Mokhtar',   color: '#D97706', students: allChildrenData.filter(c => c.classe === 'Maternelle') },
  { id: 2, name: 'Primaire 1',  educator: 'Zineb Mokhtar',   color: '#065F46', students: allChildrenData.filter(c => c.classe === 'Primaire 1') },
  { id: 3, name: 'Primaire 2',  educator: 'Karim Mansouri',  color: '#3E5A78', students: allChildrenData.filter(c => c.classe === 'Primaire 2') },
  { id: 4, name: 'Primaire 3',  educator: 'Fatima Benmoussa',color: '#7C3AED', students: allChildrenData.filter(c => c.classe === 'Primaire 3') },
  { id: 5, name: 'Collège',     educator: 'Hassan Mekki',    color: '#B91C1C', students: allChildrenData.filter(c => c.classe === 'Collège') },
  { id: 6, name: 'Soutien',     educator: 'Rachid Ammari',   color: '#374151', students: [] },
];

// ─── Modale centrée (remplace l'ancien drawer latéral) ────────────────────────

function ClassModal({ cls, onClose }: { cls: typeof CLASS_LIST[0]; onClose: () => void }) {
  const presents = cls.students.filter(s => s.attendanceStatus === 'present').length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col"
        style={{ background: '#FFFFFF', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: cls.color + '20' }}>
              <BookOpen size={18} style={{ color: cls.color }} />
            </div>
            <div>
              <p style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>{cls.name}</p>
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>{cls.educator}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>

        {/* Status badges */}
        {cls.students.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
            <span className="px-2 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#065F46', fontSize: 11, fontWeight: 600 }}>
              {presents} présents
            </span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 11, fontWeight: 600 }}>
              {cls.students.length - presents} absents
            </span>
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>{cls.students.length} total</span>
          </div>
        )}

        {/* Student list — scrollable */}
        <ul className="flex-1 overflow-y-auto">
          {cls.students.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun élève assigné à cette classe.</p>
            </div>
          ) : (
            cls.students.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50"
                style={{ borderBottom: i < cls.students.length - 1 ? '1px solid #F9F7F3' : 'none' }}
              >
                <div
                  className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ width: 34, height: 34, background: cls.color + '15', color: cls.color, fontSize: 11, fontWeight: 700 }}
                >
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{s.firstName} {s.lastName}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 11 }}>
                    {new Date('2026-05-03').getFullYear() - new Date(s.dob).getFullYear()} ans
                  </p>
                </div>
                <span
                  className="px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: s.attendanceStatus === 'present' ? '#ECFDF5' : '#FEF2F2',
                    color: s.attendanceStatus === 'present' ? '#065F46' : '#B91C1C',
                    fontSize: 10, fontWeight: 600,
                  }}
                >
                  {s.attendanceStatus === 'present' ? 'Présent' : 'Absent'}
                </span>
              </li>
            ))
          )}
        </ul>

        {/* Footer — lecture seule, pas de bouton Modifier */}
        <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClassesPage() {
  const [selected, setSelected] = useState<typeof CLASS_LIST[0] | null>(null);
  const total = CLASS_LIST.reduce((s, c) => s + c.students.length, 0);

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Classes & Groupes</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{CLASS_LIST.length} classes · {total} élèves</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CLASS_LIST.map((cls) => {
          const presents = cls.students.filter(s => s.attendanceStatus === 'present').length;
          const pct = cls.students.length > 0 ? Math.round((presents / cls.students.length) * 100) : 0;
          return (
            <div key={cls.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-all"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
              onClick={() => setSelected(cls)}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: cls.color + '15' }}>
                  <BookOpen size={18} style={{ color: cls.color }} />
                </div>
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>{cls.students.length} élèves</span>
              </div>
              <p style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{cls.name}</p>
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{cls.educator}</p>
              {cls.students.length > 0 && (
                <>
                  <div className="relative h-1.5 rounded-full overflow-hidden mt-4 mb-2" style={{ background: '#F3F4F6' }}>
                    <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${pct}%`, background: cls.color }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: '#6B7280', fontSize: 11 }}>{presents}/{cls.students.length} présents</span>
                    <span style={{ color: cls.color, fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-end mt-3">
                <span className="flex items-center gap-1" style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
                  Voir les élèves <ChevronRight size={13} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selected && <ClassModal cls={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}