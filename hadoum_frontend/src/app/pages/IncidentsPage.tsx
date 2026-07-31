import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { incidentsApi, type ApiIncident, type ApiIncidentType, type ApiIncidentStatus } from '../services/incidents.api';
import {
  Plus, X, AlertTriangle, CheckCircle2, Eye, Clock, AlertCircle,
  FileText, Send, Upload, Paperclip, Pencil, Trash2,
} from 'lucide-react';

// ─── Types (UI-facing, French labels) ──────────────────────────────────────────

type IncidentType = 'médical' | 'comportement' | 'scolaire' | 'logistique' | 'autre';
type IncidentStatus = 'en cours' | 'planifié' | 'en retard' | 'résolu';

interface IncidentNoteUi { text: string; author: string; date: string; }

interface IncidentUi {
  id: string;
  title: string;
  type: IncidentType;
  description: string;
  signaledBy: string;
  date: string;
  dateIso: string;
  status: IncidentStatus;
  notes: IncidentNoteUi[];
  hasAttachment: boolean;
}

const TYPE_TO_API: Record<IncidentType, ApiIncidentType> = {
  'médical': 'MEDICAL', comportement: 'COMPORTEMENT', scolaire: 'SCOLAIRE', logistique: 'LOGISTIQUE', autre: 'AUTRE',
};
const TYPE_FROM_API: Record<ApiIncidentType, IncidentType> = {
  MEDICAL: 'médical', COMPORTEMENT: 'comportement', SCOLAIRE: 'scolaire', LOGISTIQUE: 'logistique', AUTRE: 'autre',
};
const STATUS_FROM_API: Record<ApiIncidentStatus, IncidentStatus> = {
  EN_COURS: 'en cours', PLANIFIE: 'planifié', EN_RETARD: 'en retard', RESOLU: 'résolu',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

function toUi(api: ApiIncident): IncidentUi {
  return {
    id: api.id,
    title: api.title,
    type: TYPE_FROM_API[api.type],
    description: api.description ?? '',
    signaledBy: api.signaledBy,
    date: fmtDate(api.date),
    dateIso: api.date.slice(0, 10),
    status: STATUS_FROM_API[api.status],
    notes: api.notes.map(n => ({ text: n.text, author: n.author, date: fmtDate(n.createdAt) })),
    hasAttachment: !!api.attachmentKey,
  };
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<IncidentStatus, { bg: string; color: string; label: string; icon: React.ElementType }> = {
  'en cours':  { bg: '#EEF2F7', color: '#3E5A78', label: 'En cours',  icon: Clock },
  'planifié':  { bg: '#FFFBEB', color: '#D97706', label: 'Planifié',  icon: AlertTriangle },
  'en retard': { bg: '#FEF2F2', color: '#B91C1C', label: 'En retard', icon: AlertCircle },
  'résolu':    { bg: '#ECFDF5', color: '#065F46', label: 'Résolu',    icon: CheckCircle2 },
};

const TYPE_LABELS: IncidentType[] = ['médical', 'comportement', 'scolaire', 'logistique', 'autre'];

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Signal Incident Modal ─────────────────────────────────────────────────────

function SignalModal({ initial, onSave, onClose }: {
  initial?: IncidentUi;
  onSave: (i: { title: string; type: IncidentType; description: string; date: string }, file: File | null) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    type: initial?.type ?? ('comportement' as IncidentType),
    description: initial?.description ?? '',
    date: initial?.dateIso ?? new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState<File | null>(null);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const canSave = form.title.trim().length > 0 && form.date.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? "Modifier l'incident" : 'Signaler un incident'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Titre *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ex : Conflit en cour" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {TYPE_LABELS.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder="Décrivez l'incident…" style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Pièce jointe {isEdit && initial?.hasAttachment ? '(remplacer)' : '(optionnel)'}
            </label>
            <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
              style={{ border: `1px solid ${file ? '#A7F3D0' : '#E5E7EB'}`, background: file ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
              <Upload size={14} style={{ color: file ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ flex: 1, color: file ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : isEdit && initial?.hasAttachment ? 'Pièce jointe existante — choisir un fichier pour la remplacer' : 'Joindre une photo ou un document…'}
              </span>
              {file && (
                <button type="button" onClick={e => { e.preventDefault(); setFile(null); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                  <X size={13} />
                </button>
              )}
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave({ title: form.title, type: form.type, description: form.description, date: form.date }, file);
            }}
            className="flex-1 py-2.5 rounded-lg"
            style={{
              background: canSave ? '#B91C1C' : '#E5E7EB',
              color: canSave ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}>
            {isEdit ? 'Enregistrer' : 'Signaler'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailModal({ incident, canManage, onClose, onAddNote, onResolve, onEdit, onDelete }: {
  incident: IncidentUi;
  canManage: boolean; // director only
  onClose: () => void;
  onAddNote: (id: string, text: string) => void;
  onResolve: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [noteText, setNoteText] = useState('');
  const st = STATUS_CFG[incident.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col"
        style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                {st.label.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                {incident.type.toUpperCase()}
              </span>
            </div>
            <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{incident.title}</h3>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
              Signalé par {incident.signaledBy} · {incident.date}
            </p>
          </div>
          {incident.hasAttachment && (
            <button
              onClick={async () => {
                const { url } = await incidentsApi.getAttachmentUrl(incident.id);
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0"
              style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              title="Voir la pièce jointe"
            >
              <Paperclip size={13} /> Pièce jointe
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Description */}
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>DESCRIPTION</p>
            <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{incident.description || '—'}</p>
          </div>

          {/* Notes history */}
          {incident.notes.length > 0 && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>HISTORIQUE DES NOTES</p>
              <div className="space-y-3">
                {incident.notes.map((note, i) => (
                  <div key={i} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#1A1A1A', fontSize: 13 }}>{note.text}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>{note.author} · {note.date}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add note — director only, unless resolved */}
          {canManage && incident.status !== 'résolu' && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>
                AJOUTER UNE NOTE
                <span style={{ color: '#D97706', marginLeft: 6, fontWeight: 400 }}>→ passe le statut à « Planifié »</span>
              </p>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                placeholder="Décrivez les actions prévues…"
                style={{ ...INPUT, resize: 'none' }}
              />
              <button
                disabled={!noteText.trim()}
                onClick={() => {
                  if (noteText.trim()) {
                    onAddNote(incident.id, noteText.trim());
                    setNoteText('');
                  }
                }}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{
                  background: noteText.trim() ? '#D97706' : '#E5E7EB',
                  color: noteText.trim() ? '#FFFFFF' : '#9CA3AF',
                  fontSize: 13, fontWeight: 600, border: 'none',
                  cursor: noteText.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                <Send size={13} /> Enregistrer la note
              </button>
            </div>
          )}
        </div>

        {/* Footer — director actions */}
        {canManage && (
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                <Pencil size={13} /> Modifier
              </button>
              <button
                onClick={() => { onDelete(); onClose(); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
            {incident.status !== 'résolu' && (
              <button
                onClick={() => { onResolve(incident.id); onClose(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                <CheckCircle2 size={14} /> Marquer comme résolu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function IncidentsPage() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<IncidentUi[]>([]);
  const [filter, setFilter]       = useState<IncidentStatus | 'all'>('all');
  const [showSignal, setShowSignal] = useState(false);
  const [editTarget, setEditTarget] = useState<IncidentUi | null>(null);
  const [detail, setDetail]         = useState<IncidentUi | null>(null);

  useEffect(() => {
    incidentsApi.list().then(data => setIncidents(data.map(toUi))).catch(() => {});
  }, []);

  const isDirector   = user?.role === 'director';
  const canSignal    = user?.role === 'director' || user?.role === 'educator' || user?.role === 'supervisor';

  // Counts
  const counts = {
    all:         incidents.length,
    'en cours':  incidents.filter(i => i.status === 'en cours').length,
    'planifié':  incidents.filter(i => i.status === 'planifié').length,
    'en retard': incidents.filter(i => i.status === 'en retard').length,
    'résolu':    incidents.filter(i => i.status === 'résolu').length,
  };

  const visible = filter === 'all' ? incidents : incidents.filter(i => i.status === filter);

  const addIncident = async (form: { title: string; type: IncidentType; description: string; date: string }, file: File | null) => {
    let created = await incidentsApi.create({
      title: form.title,
      type: TYPE_TO_API[form.type],
      description: form.description || undefined,
      signaledBy: user?.name ?? 'Utilisateur',
      date: form.date,
    });
    if (file) created = await incidentsApi.uploadAttachment(created.id, file);
    setIncidents(prev => [toUi(created), ...prev]);
    setShowSignal(false);
  };

  const updateIncident = async (form: { title: string; type: IncidentType; description: string; date: string }, file: File | null) => {
    if (!editTarget) return;
    try {
      let updated = await incidentsApi.update(editTarget.id, {
        title: form.title,
        type: TYPE_TO_API[form.type],
        description: form.description || undefined,
        date: form.date,
      });
      if (file) updated = await incidentsApi.uploadAttachment(editTarget.id, file);
      const ui = toUi(updated);
      setIncidents(prev => prev.map(inc => inc.id === ui.id ? ui : inc));
      setDetail(prev => prev && prev.id === ui.id ? ui : prev);
      setEditTarget(null);
    } catch {
      toast.error("Erreur lors de la modification de l'incident.");
    }
  };

  const deleteIncident = async (id: string) => {
    if (!window.confirm('Supprimer définitivement cet incident ? Cette action est irréversible.')) return;
    try {
      await incidentsApi.delete(id);
      setIncidents(prev => prev.filter(inc => inc.id !== id));
      setDetail(prev => prev && prev.id === id ? null : prev);
    } catch {
      toast.error("Erreur lors de la suppression de l'incident.");
    }
  };

  const addNote = async (id: string, text: string) => {
    const updated = await incidentsApi.addNote(id, text, user?.name ?? 'Directrice');
    const ui = toUi(updated);
    setIncidents(prev => prev.map(inc => inc.id === id ? ui : inc));
    setDetail(ui);
  };

  const resolve = async (id: string) => {
    const updated = await incidentsApi.resolve(id);
    setIncidents(prev => prev.map(inc => inc.id === id ? toUi(updated) : inc));
  };

  const FILTER_TABS: { key: IncidentStatus | 'all'; label: string }[] = [
    { key: 'all',        label: 'Tous' },
    { key: 'en cours',   label: 'En cours' },
    { key: 'planifié',   label: 'Planifiés' },
    { key: 'en retard',  label: 'En retard' },
    { key: 'résolu',     label: 'Résolus' },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Suivi des incidents</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {counts['en retard'] > 0 && (
              <span style={{ color: '#B91C1C', fontWeight: 600 }}>{counts['en retard']} en retard · </span>
            )}
            {counts['en cours']} en cours · {incidents.length} total
          </p>
        </div>
        {canSignal && (
          <button onClick={() => setShowSignal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#B91C1C', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Signaler un incident
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_TABS.map(({ key, label }) => {
          const n = key === 'all' ? counts.all : counts[key as IncidentStatus];
          const st = key !== 'all' ? STATUS_CFG[key as IncidentStatus] : null;
          return (
            <button key={key} onClick={() => setFilter(key)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background: filter === key ? (st?.color ?? '#3E5A78') : '#FFFFFF',
                color: filter === key ? '#FFFFFF' : '#374151',
                fontSize: 13, fontWeight: 500,
                border: `1px solid ${filter === key ? 'transparent' : '#E5E7EB'}`,
                cursor: 'pointer',
              }}>
              {label}
              <span className="px-1.5 py-0.5 rounded-full"
                style={{ background: filter === key ? 'rgba(255,255,255,0.2)' : '#F3F4F6', color: filter === key ? '#FFFFFF' : '#6B7280', fontSize: 11, fontWeight: 600 }}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Incidents list */}
      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <CheckCircle2 size={28} style={{ color: '#065F46', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun incident dans cette catégorie</p>
          </div>
        ) : visible.map(inc => {
          const st = STATUS_CFG[inc.status];
          const StIcon = st.icon;
          return (
            <div key={inc.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: `1px solid ${inc.status === 'en retard' ? '#FECACA' : '#E5E7EB'}` }}
              onClick={() => setDetail(inc)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                      <StIcon size={10} /> {st.label.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded-full"
                      style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                      {inc.type.toUpperCase()}
                    </span>
                    {inc.notes.length > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 10, fontWeight: 500 }}>
                        <FileText size={9} /> {inc.notes.length} note{inc.notes.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{inc.title}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    Signalé par {inc.signaledBy} · {inc.date}
                  </p>
                  {inc.description && (
                    <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }} className="line-clamp-2">
                      {inc.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setDetail(inc); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Eye size={13} /> Voir
                  </button>
                  {isDirector && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setEditTarget(inc); }}
                        title="Modifier"
                        className="p-1.5 rounded-lg"
                        style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
                        <Pencil size={14} style={{ color: '#374151' }} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteIncident(inc.id); }}
                        title="Supprimer"
                        className="p-1.5 rounded-lg"
                        style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
                        <Trash2 size={14} style={{ color: '#B91C1C' }} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showSignal && (
        <SignalModal
          onSave={addIncident}
          onClose={() => setShowSignal(false)}
        />
      )}
      {editTarget && (
        <SignalModal
          initial={editTarget}
          onSave={updateIncident}
          onClose={() => setEditTarget(null)}
        />
      )}
      {detail && (
        <DetailModal
          incident={detail}
          canManage={isDirector}
          onClose={() => setDetail(null)}
          onAddNote={addNote}
          onResolve={resolve}
          onEdit={() => { setEditTarget(detail); setDetail(null); }}
          onDelete={() => deleteIncident(detail.id)}
        />
      )}
    </div>
  );
}
