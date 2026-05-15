import { useState } from 'react';
import { X, Plus, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface FollowUp {
  id: number; child: string; topic: string; educator: string;
  dueDate: string; status: 'en retard' | 'en cours' | 'planifié' | 'résolu';
  notes: string[];
}

const INIT: FollowUp[] = [
  { id: 1, child: 'Sara Ouali',    topic: 'Absences répétées',          educator: 'Karim M.',   dueDate: '05 Mai', status: 'en retard', notes: ['Contact tuteur effectué le 28 Avr.'] },
  { id: 2, child: 'Omar Rahmani',  topic: 'Comportement — médiation',   educator: 'Fatima B.',  dueDate: '07 Mai', status: 'en cours',  notes: [] },
  { id: 3, child: 'Amine Belarbi', topic: 'Dossier médical incomplet',  educator: 'Karim M.',   dueDate: '10 Mai', status: 'planifié',  notes: [] },
  { id: 4, child: 'Imane Boudali', topic: 'Difficultés scolaires',      educator: 'Zineb M.',   dueDate: '12 Mai', status: 'en cours',  notes: ['Évaluation réalisée le 1er Mai.'] },
  { id: 5, child: 'Khalid Hamdi',  topic: 'Dossier partiellement vide', educator: 'Fatima B.',  dueDate: '15 Mai', status: 'planifié',  notes: [] },
];

const ST: Record<FollowUp['status'], { bg: string; color: string; label: string }> = {
  'en retard': { bg: '#FEF2F2', color: '#B91C1C', label: 'EN RETARD' },
  'en cours':  { bg: '#EEF2F7', color: '#3E5A78', label: 'EN COURS'  },
  planifié:    { bg: '#FFFBEB', color: '#D97706', label: 'PLANIFIÉ'  },
  résolu:      { bg: '#ECFDF5', color: '#065F46', label: 'RÉSOLU'    },
};

function NotePanel({ item, onAddNote, onResolve, onClose }: { item: FollowUp; onAddNote: (note: string) => void; onResolve: () => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const st = ST[item.status];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="h-full w-full max-w-sm flex flex-col" style={{ background: '#FFFFFF', borderLeft: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Suivi — {item.child}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="rounded-xl p-4" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
            <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{item.topic}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600 }}>{st.label}</span>
              <span style={{ color: '#6B7280', fontSize: 12 }}>{item.educator}</span>
              <span className="flex items-center gap-1" style={{ color: '#9CA3AF', fontSize: 12 }}><Clock size={10} /> {item.dueDate}</span>
            </div>
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 10 }}>NOTES DE SUIVI</p>
            {item.notes.length === 0
              ? <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune note pour le moment.</p>
              : item.notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#3E5A78' }} />
                  <p style={{ color: '#374151', fontSize: 13 }}>{n}</p>
                </div>
              ))
            }
          </div>
        </div>
        <div className="px-6 py-4 space-y-3" style={{ borderTop: '1px solid #F3F4F6' }}>
          <div className="flex gap-2">
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Ajouter une note…"
              className="flex-1 px-3 py-2 rounded-lg outline-none"
              style={{ background: '#F9F7F3', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13 }} />
            <button onClick={() => { if (note.trim()) { onAddNote(note.trim()); setNote(''); } }}
              className="px-3 py-2 rounded-lg"
              style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
              <Plus size={14} />
            </button>
          </div>
          {item.status !== 'résolu' && (
            <button onClick={onResolve} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg"
              style={{ background: '#ECFDF5', color: '#065F46', fontSize: 13, fontWeight: 600, border: '1px solid #A7F3D0', cursor: 'pointer' }}>
              <CheckCircle2 size={14} /> Marquer comme résolu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MonitoringPage() {
  const [items, setItems] = useState<FollowUp[]>(INIT);
  const [selected, setSelected] = useState<FollowUp | null>(null);
  const [filter, setFilter] = useState<'all' | FollowUp['status']>('all');

  const visible = items.filter(i => filter === 'all' || i.status === filter);
  const urgent = items.filter(i => i.status === 'en retard').length;

  const addNote = (note: string) => {
    setItems(prev => prev.map(i => i.id === selected?.id ? { ...i, notes: [...i.notes, note] } : i));
    setSelected(prev => prev ? { ...prev, notes: [...prev.notes, note] } : null);
  };

  const resolve = () => {
    setItems(prev => prev.map(i => i.id === selected?.id ? { ...i, status: 'résolu' } : i));
    setSelected(prev => prev ? { ...prev, status: 'résolu' } : null);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Suivis individuels</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Enfants nécessitant un accompagnement renforcé</p>
      </div>

      {urgent > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertCircle size={15} style={{ color: '#B91C1C', flexShrink: 0 }} />
          <p style={{ color: '#B91C1C', fontSize: 13 }}><strong>{urgent} suivi{urgent > 1 ? 's' : ''}</strong> en retard — action requise</p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {([['all','Tous',items.length],['en retard','En retard',urgent],['en cours','En cours',items.filter(i=>i.status==='en cours').length],['planifié','Planifiés',items.filter(i=>i.status==='planifié').length],['résolu','Résolus',items.filter(i=>i.status==='résolu').length]] as [string,string,number][]).map(([f,label,n]) => (
          <button key={f} onClick={() => setFilter(f as any)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg"
            style={{ background: filter === f ? '#3E5A78' : '#FFFFFF', color: filter === f ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: 500, border: `1px solid ${filter === f ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer' }}>
            {label}
            <span className="px-1.5 py-0.5 rounded-full" style={{ background: filter === f ? 'rgba(255,255,255,0.2)' : '#F3F4F6', color: filter === f ? '#FFFFFF' : '#6B7280', fontSize: 11, fontWeight: 600 }}>{n}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((item) => {
          const st = ST[item.status];
          return (
            <div key={item.id} className="rounded-xl p-5 flex items-start gap-4 hover:shadow-sm transition-all cursor-pointer"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
              onClick={() => setSelected(item)}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 700 }}>
                {item.child.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{item.child}</p>
                <p style={{ color: '#374151', fontSize: 13, marginTop: 1 }}>{item.topic}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span style={{ color: '#6B7280', fontSize: 12 }}>{item.educator}</span>
                  <span className="flex items-center gap-1" style={{ color: '#9CA3AF', fontSize: 12 }}><Clock size={10} /> {item.dueDate}</span>
                  {item.notes.length > 0 && <span style={{ color: '#9CA3AF', fontSize: 12 }}>{item.notes.length} note{item.notes.length > 1 ? 's' : ''}</span>}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600 }}>{st.label}</span>
            </div>
          );
        })}
      </div>

      {selected && (
        <NotePanel
          item={items.find(i => i.id === selected.id) ?? selected}
          onAddNote={addNote}
          onResolve={resolve}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
