import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Send, MessageSquare } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  from: string;
  text: string;
  time: string;
  isMine: boolean;
}

interface Conversation {
  id: number;
  participantName: string;
  participantRole: string;
  participantInitials: string;
  messages: Message[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function fmtTime(minutesBack: number) {
  const d = new Date(Date.now() - minutesBack * 60000);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const DIRECTOR_CONVERSATIONS: Conversation[] = [
  {
    id: 1,
    participantName: 'Karim Mansouri',
    participantRole: 'Éducateur',
    participantInitials: 'KM',
    messages: [
      { id: 1, from: 'Karim Mansouri', text: 'Bonjour Amira, j\'ai une question concernant le planning de la semaine prochaine.', time: fmtTime(45), isMine: false },
      { id: 2, from: 'Amira Benali', text: 'Bonjour Karim ! Dis-moi, je t\'écoute.', time: fmtTime(40), isMine: true },
      { id: 3, from: 'Karim Mansouri', text: 'Est-ce que je peux décaler ma classe du mercredi matin à l\'après-midi ?', time: fmtTime(38), isMine: false },
      { id: 4, from: 'Amira Benali', text: 'Oui, c\'est possible. Je mets à jour le planning.', time: fmtTime(30), isMine: true },
    ],
  },
  {
    id: 2,
    participantName: 'Fatima Bouzid',
    participantRole: 'Infirmière',
    participantInitials: 'FB',
    messages: [
      { id: 1, from: 'Fatima Bouzid', text: 'Bonjour, je voulais signaler que le stock de médicaments est bas.', time: fmtTime(120), isMine: false },
      { id: 2, from: 'Amira Benali', text: 'Merci Fatima, je vais passer une commande cette semaine.', time: fmtTime(110), isMine: true },
      { id: 3, from: 'Fatima Bouzid', text: 'Parfait, merci beaucoup !', time: fmtTime(105), isMine: false },
    ],
  },
  {
    id: 3,
    participantName: 'Youcef Amrani',
    participantRole: 'Comptable',
    participantInitials: 'YA',
    messages: [
      { id: 1, from: 'Youcef Amrani', text: 'Le rapport financier de mars est prêt. Vous pouvez le consulter dans l\'espace rapports.', time: fmtTime(200), isMine: false },
      { id: 2, from: 'Amira Benali', text: 'Excellent, je le regarderai ce soir. Merci Youcef.', time: fmtTime(195), isMine: true },
    ],
  },
];

const EDUCATOR_CONVERSATIONS: Conversation[] = [
  {
    id: 1,
    participantName: 'Amira Benali',
    participantRole: 'Directrice',
    participantInitials: 'AB',
    messages: [
      { id: 1, from: 'Amira Benali', text: 'Bonjour Karim, comment se passent les classes cette semaine ?', time: fmtTime(90), isMine: false },
      { id: 2, from: 'Karim Mansouri', text: 'Très bien ! Les élèves sont très motivés pour le projet de lecture.', time: fmtTime(85), isMine: true },
      { id: 3, from: 'Amira Benali', text: 'Parfait, continuez comme ça !', time: fmtTime(80), isMine: false },
    ],
  },
];

// ─── Conversation list item ───────────────────────────────────────────────────

function ConvItem({ conv, isActive, onClick }: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const last = conv.messages[conv.messages.length - 1];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
      style={{
        background: isActive ? '#EEF2F7' : 'transparent',
        border: 'none',
        borderBottom: '1px solid #F3F4F6',
        cursor: 'pointer',
        borderLeft: isActive ? '3px solid #3E5A78' : '3px solid transparent',
      }}>
      <div className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: 40, height: 40, background: isActive ? '#3E5A78' : '#F3F4F6', color: isActive ? '#FFFFFF' : '#6B7280', fontSize: 13, fontWeight: 700 }}>
        {conv.participantInitials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{conv.participantName}</p>
          <span style={{ color: '#9CA3AF', fontSize: 11 }}>{last?.time ?? ''}</span>
        </div>
        <p className="truncate" style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>
          {last?.isMine ? 'Vous : ' : ''}{last?.text ?? ''}
        </p>
      </div>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  return (
    <div className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="rounded-2xl px-4 py-2.5"
        style={{
          maxWidth: '72%',
          background: msg.isMine ? '#3E5A78' : '#FFFFFF',
          color: msg.isMine ? '#FFFFFF' : '#1A1A1A',
          border: msg.isMine ? 'none' : '1px solid #E5E7EB',
          borderBottomRightRadius: msg.isMine ? 4 : 16,
          borderBottomLeftRadius: msg.isMine ? 16 : 4,
        }}>
        <p style={{ fontSize: 13 }}>{msg.text}</p>
        <p style={{ fontSize: 10, marginTop: 4, color: msg.isMine ? 'rgba(255,255,255,0.6)' : '#9CA3AF', textAlign: 'right' }}>
          {msg.time}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MessagesPage() {
  const { user } = useAuth();

  const baseConversations = user?.role === 'director'
    ? DIRECTOR_CONVERSATIONS
    : EDUCATOR_CONVERSATIONS;

  const [activeId, setActiveId] = useState<number>(baseConversations[0]?.id ?? 1);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [convList, setConvList] = useState<Conversation[]>(baseConversations);
  const endRef = useRef<HTMLDivElement>(null);

  const active = convList.find(c => c.id === activeId) ?? convList[0];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, activeId]);

  const draft = drafts[activeId] ?? '';

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !active) return;
    const newMsg: Message = {
      id: Date.now(),
      from: user?.name ?? '',
      text,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      isMine: true,
    };
    setConvList(prev => prev.map(c =>
      c.id === activeId ? { ...c, messages: [...c.messages, newMsg] } : c
    ));
    setDrafts(prev => ({ ...prev, [activeId]: '' }));
  };

  if (!user || (user.role !== 'director' && user.role !== 'educator')) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>Messagerie non disponible pour votre rôle.</p>
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

      {/* Left column — conversation list */}
      <div className="flex-shrink-0 flex flex-col"
        style={{ width: 300, borderRight: '1px solid #E5E7EB', background: '#FFFFFF', overflowY: 'auto' }}>
        <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6', position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 1 }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={16} style={{ color: '#3E5A78' }} />
            <h2 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Messagerie</h2>
          </div>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
            {user.role === 'director' ? 'Direction ↔ Équipe' : 'Vous ↔ Direction'}
          </p>
        </div>
        {convList.map(conv => (
          <ConvItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeId}
            onClick={() => setActiveId(conv.id)}
          />
        ))}
      </div>

      {/* Right column — thread */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F9F7F3' }}>

        {/* Thread header */}
        {active && (
          <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid #E5E7EB', background: '#FFFFFF' }}>
            <div className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{ width: 38, height: 38, background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 700 }}>
              {active.participantInitials}
            </div>
            <div>
              <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{active.participantName}</p>
              <p style={{ color: '#9CA3AF', fontSize: 12 }}>{active.participantRole}</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {active?.messages.map(msg => (
            <Bubble key={msg.id} msg={msg} />
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid #E5E7EB', background: '#FFFFFF' }}>
          <input
            value={draft}
            onChange={e => setDrafts(prev => ({ ...prev, [activeId]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Écrire un message…"
            className="flex-1 rounded-xl px-4 py-2.5 outline-none"
            style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13 }}
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim()}
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{
              width: 40, height: 40,
              background: draft.trim() ? '#3E5A78' : '#E5E7EB',
              border: 'none',
              cursor: draft.trim() ? 'pointer' : 'not-allowed',
            }}>
            <Send size={16} style={{ color: draft.trim() ? '#FFFFFF' : '#9CA3AF' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
