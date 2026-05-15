import { useState } from 'react';
import { inboxMessages, Message } from '../data/mockData';
import { Plus, Star, Search, X, Send, ArrowLeft } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  'Directrice': '#3E5A78', 'Superviseure': '#7C3AED', 'Éducateur': '#065F46',
  'Éducatrice': '#065F46', 'Système': '#9CA3AF',
};

function ComposeModal({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const INPUT: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  if (sent) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="w-full max-w-sm rounded-2xl p-8 text-center" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-center rounded-full mx-auto mb-4" style={{ width: 52, height: 52, background: '#ECFDF5' }}>
          <Send size={22} style={{ color: '#065F46' }} />
        </div>
        <p style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Message envoyé</p>
        <button onClick={onClose} className="px-6 py-2 rounded-lg" style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>Fermer</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Nouveau message</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>À</label>
            <select value={to} onChange={e => setTo(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
              <option value="">Sélectionner un destinataire…</option>
              {['Amira Benali (Directrice)','Nadia Hamidi (Superviseure)','Karim Mansouri (Éducateur)','Zineb Mokhtar (Éducatrice)'].map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Objet</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet du message…" style={INPUT} /></div>
          <div><label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Rédigez votre message…"
              style={{ ...INPUT, resize: 'none' }} /></div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => { if (to && subject) setSent(true); }}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-lg"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Send size={14} /> Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>(inboxMessages);
  const [selected, setSelected] = useState<Message | null>(null);
  const [search, setSearch] = useState('');
  const [compose, setCompose] = useState(false);

  const filtered = messages.filter(m => !search || m.subject.toLowerCase().includes(search.toLowerCase()) || m.from.toLowerCase().includes(search.toLowerCase()));
  const unread = messages.filter(m => !m.read).length;

  const openMessage = (m: Message) => {
    setSelected(m);
    setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, read: true } : msg));
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ maxHeight: 'calc(100vh - 64px)' }}>
      {/* Sidebar */}
      <div className={`flex flex-col ${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-shrink-0`}
        style={{ borderRight: '1px solid #E5E7EB', background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div>
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Messagerie</h3>
            {unread > 0 && <p style={{ color: '#3E5A78', fontSize: 12, marginTop: 1 }}>{unread} non lu{unread > 1 ? 's' : ''}</p>}
          </div>
          <button onClick={() => setCompose(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={13} /> Nouveau
          </button>
        </div>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full pl-8 pr-3 py-2 rounded-lg outline-none" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 12 }} />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.map((m) => {
            const color = ROLE_COLORS[m.fromRole] ?? '#9CA3AF';
            return (
              <li key={m.id} onClick={() => openMessage(m)}
                className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                style={{ borderBottom: '1px solid #F9F7F3', background: selected?.id === m.id ? '#F0F4F8' : 'transparent' }}>
                <div className="flex items-center justify-center rounded-full flex-shrink-0 mt-0.5"
                  style={{ width: 34, height: 34, background: color + '20', color, fontSize: 12, fontWeight: 700 }}>
                  {m.from.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: m.read ? 400 : 700 }} className="truncate">{m.from}</p>
                    <span style={{ color: '#9CA3AF', fontSize: 11, flexShrink: 0 }}>{m.time}</span>
                  </div>
                  <p style={{ color: m.read ? '#6B7280' : '#1A1A1A', fontSize: 12, fontWeight: m.read ? 400 : 600 }} className="truncate">{m.subject}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 11 }} className="truncate">{m.preview}</p>
                </div>
                {!m.read && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: '#3E5A78' }} />}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Message detail */}
      <div className={`flex-1 flex flex-col ${!selected ? 'hidden md:flex' : 'flex'}`} style={{ background: '#F9F7F3' }}>
        {selected ? (
          <>
            <div className="flex items-center gap-3 px-6 py-4" style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
              <button onClick={() => setSelected(null)} className="md:hidden p-1.5 rounded-lg hover:bg-gray-100">
                <ArrowLeft size={16} style={{ color: '#374151' }} />
              </button>
              <div>
                <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 700 }}>{selected.subject}</p>
                <p style={{ color: '#6B7280', fontSize: 12 }}>De : {selected.from} ({selected.fromRole}) · {selected.time}</p>
              </div>
              {selected.important && <Star size={15} style={{ color: '#D97706', fill: '#D97706' }} />}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-2xl">
                <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.7 }}>{selected.preview}</p>
                </div>
                <div className="mt-4 rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>Répondre</p>
                  <textarea rows={3} placeholder="Votre réponse…"
                    className="w-full px-3 py-2 rounded-lg outline-none resize-none"
                    style={{ background: '#F9F7F3', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />
                  <button className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Send size={13} /> Répondre
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="flex items-center justify-center rounded-2xl mx-auto mb-4" style={{ width: 56, height: 56, background: '#EEF2F7' }}>
                <Send size={24} style={{ color: '#3E5A78' }} />
              </div>
              <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Sélectionnez un message</p>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>ou composez un nouveau message</p>
            </div>
          </div>
        )}
      </div>

      {compose && <ComposeModal onClose={() => setCompose(false)} />}
    </div>
  );
}
