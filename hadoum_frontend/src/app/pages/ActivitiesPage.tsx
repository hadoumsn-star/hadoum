import { useState } from 'react';
import { activitiesData, Activity } from '../data/mockData';
import { Plus, X, Check } from 'lucide-react';

const TYPE = {
  pédagogique: { bg: '#EEF2F7', color: '#3E5A78' },
  culturelle:  { bg: '#F5F3FF', color: '#7C3AED' },
  sportive:    { bg: '#ECFDF5', color: '#065F46' },
  artistique:  { bg: '#FFFBEB', color: '#D97706' },
};

const STATUS = {
  planifiée:  { bg: '#EEF2F7', color: '#3E5A78', label: 'PLANIFIÉE' },
  'en cours': { bg: '#FFFBEB', color: '#D97706', label: 'EN COURS'  },
  terminée:   { bg: '#ECFDF5', color: '#065F46', label: 'TERMINÉE'  },
  annulée:    { bg: '#F3F4F6', color: '#9CA3AF', label: 'ANNULÉE'   },
};

const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

function NewActivityModal({ onSave, onClose }: { onSave: (a: Activity) => void; onClose: () => void }) {
  const [form, setForm] = useState({ title: '', type: 'pédagogique' as Activity['type'], class: '', educator: '', date: '', time: '', participants: 0 });
  const set = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Nouvelle activité</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Titre *</label><input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Atelier peinture" style={INPUT} autoFocus /></div>
          <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
              {(['pédagogique','culturelle','sportive','artistique'] as Activity['type'][]).map(t => (
                <button key={t} onClick={() => set('type', t)}
                  className="flex-1 py-2"
                  style={{ background: form.type === t ? TYPE[t].color : '#FFFFFF', color: form.type === t ? '#FFFFFF' : '#374151', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Classe</label>
              <select value={form.class} onChange={e => set('class', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="">Sélectionner…</option>
                {['Maternelle','Primaire 1','Primaire 2A','Primaire 2B','Primaire 3','Collège','Soutien'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Participants</label><input type="number" value={form.participants || ''} onChange={e => set('participants', parseInt(e.target.value) || 0)} placeholder="0" style={INPUT} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT} /></div>
            <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Heure</label><input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={INPUT} /></div>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => { if (form.title) { onSave({ ...form, id: Date.now(), educator: 'Karim M.', status: 'planifiée', time: form.time || '09h00', date: form.date || '10 Mai 2026' }); } }}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-lg"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Check size={14} /> Créer
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>(activitiesData);
  const [filter, setFilter] = useState<Activity['status'] | 'all'>('all');
  const [showNew, setShowNew] = useState(false);

  const visible = activities.filter(a => filter === 'all' || a.status === filter);
  const counts = { all: activities.length, planifiée: activities.filter(a => a.status === 'planifiée').length, 'en cours': activities.filter(a => a.status === 'en cours').length, terminée: activities.filter(a => a.status === 'terminée').length };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Mes activités</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{activities.length} activités · {counts.planifiée} à venir</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Créer une activité
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {([['all','Toutes',counts.all],['planifiée','Planifiées',counts.planifiée],['en cours','En cours',counts['en cours']],['terminée','Terminées',counts.terminée]] as [string,string,number][]).map(([f,label,n]) => (
          <button key={f} onClick={() => setFilter(f as any)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: filter === f ? '#3E5A78' : '#FFFFFF', color: filter === f ? '#FFFFFF' : '#374151', fontSize: 13, fontWeight: 500, border: `1px solid ${filter === f ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer' }}>
            {label} <span className="px-1.5 py-0.5 rounded-full" style={{ background: filter === f ? 'rgba(255,255,255,0.2)' : '#F3F4F6', color: filter === f ? '#FFFFFF' : '#6B7280', fontSize: 11, fontWeight: 600 }}>{n}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((a) => {
          const tp = TYPE[a.type];
          const st = STATUS[a.status];
          return (
            <div key={a.id} className="rounded-xl p-5 flex flex-col gap-3" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
              <div className="flex items-start justify-between">
                <span className="px-2 py-0.5 rounded-full" style={{ background: tp.bg, color: tp.color, fontSize: 10, fontWeight: 600, textTransform: 'capitalize' }}>{a.type}</span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600 }}>{st.label}</span>
              </div>
              <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{a.title}</p>
              <div className="space-y-1">
                <p style={{ color: '#6B7280', fontSize: 12 }}>{a.class} · {a.educator}</p>
                <p style={{ color: '#9CA3AF', fontSize: 12 }}>{a.date} · {a.time}</p>
                <p style={{ color: '#374151', fontSize: 12 }}>{a.participants} participant{a.participants > 1 ? 's' : ''}</p>
              </div>
            </div>
          );
        })}
      </div>
      {showNew && <NewActivityModal onSave={(a) => { setActivities(p => [a, ...p]); setShowNew(false); }} onClose={() => setShowNew(false)} />}
    </div>
  );
}
