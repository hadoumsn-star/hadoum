import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  incidentsApi, type ApiIncident, type ApiIncidentType, type ApiIncidentStatus,
  type ApiIncidentPriority, type CreateIncidentInput,
} from '../services/incidents.api';
import { childrenApi } from '../services/children.api';
import { teamApi, type ApiStaffMember } from '../services/team.api';
import { spacesApi, type ApiSpace } from '../services/spaces.api';
import type { ApiChildSummary } from '../types/api.types';
import {
  INCIDENT_CATEGORY_LABELS, INCIDENT_CATEGORY_OPTIONS,
  INCIDENT_STATUS_LABELS, INCIDENT_STATUS_STYLE, SELECTABLE_INCIDENT_STATUSES,
  INCIDENT_PRIORITY_LABELS, INCIDENT_PRIORITY_BADGE_LABELS, INCIDENT_PRIORITY_STYLE, INCIDENT_PRIORITY_OPTIONS,
  incidentConcernedSummary,
} from '../config/incidents.config';
import { SPACE_TYPE_LABELS } from '../config/spaces.config';
import { PersonMultiSelect } from '../components/incidents/PersonMultiSelect';
import {
  Plus, X, CheckCircle2, Eye, Clock, AlertCircle,
  Upload, Paperclip, Pencil, Trash2, Search, ShieldAlert, History,
} from 'lucide-react';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS_ICON: Record<string, React.ElementType> = {
  EN_COURS: Clock, EN_ATTENTE: Clock, RESOLU: CheckCircle2, PLANIFIE: AlertCircle, EN_RETARD: AlertCircle,
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function StatusBadge({ status }: { status: ApiIncidentStatus }) {
  const st = INCIDENT_STATUS_STYLE[status];
  const Icon = STATUS_ICON[status] ?? Clock;
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
      <Icon size={10} /> {INCIDENT_STATUS_LABELS[status].toUpperCase()}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: ApiIncidentPriority }) {
  const st = INCIDENT_PRIORITY_STYLE[priority];
  return (
    <span className="px-2 py-0.5 rounded-full" title={INCIDENT_PRIORITY_LABELS[priority]}
      style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
      {INCIDENT_PRIORITY_BADGE_LABELS[priority]}
    </span>
  );
}

function CategoryBadge({ type }: { type: ApiIncidentType }) {
  return (
    <span className="px-2 py-0.5 rounded-full"
      style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
      {INCIDENT_CATEGORY_LABELS[type].toUpperCase()}
    </span>
  );
}

function SupervisorBadge() {
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: '#FFF7ED', color: '#C2410C', fontSize: 10, fontWeight: 700 }}
      title="Créé par un(e) superviseur(e)">
      <ShieldAlert size={10} /> SUPERVISEUR
    </span>
  );
}

// ─── Create / Edit modal ─────────────────────────────────────────────────────

function IncidentModal({ initial, childrenOptions, staff, spaces, onSave, onClose }: {
  initial?: ApiIncident;
  childrenOptions: ApiChildSummary[];
  staff: ApiStaffMember[];
  spaces: ApiSpace[];
  onSave: (data: Omit<CreateIncidentInput, 'signaledBy'>, file: File | null) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    type: initial?.type ?? ('COMPORTEMENT' as ApiIncidentType),
    priority: initial?.priority ?? ('N3' as ApiIncidentPriority),
    description: initial?.description ?? '',
    date: initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  });
  const [childIds, setChildIds] = useState<string[]>(initial?.children.map(c => c.child.id) ?? []);
  const [staffIds, setStaffIds] = useState<string[]>(initial?.staffLinks.map(s => s.staffMember.id) ?? []);
  const [spaceIds, setSpaceIds] = useState<string[]>(initial?.spaces.map(s => s.space.id) ?? []);
  const [file, setFile] = useState<File | null>(null);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const canSave = form.title.trim().length > 0 && form.description.trim().length > 0 && form.date.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="incident-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
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
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Catégorie</label>
              <select data-testid="incident-category-select" value={form.type} onChange={e => set('type', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {INCIDENT_CATEGORY_OPTIONS.map(t => <option key={t} value={t}>{INCIDENT_CATEGORY_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Priorité *</label>
            <select data-testid="incident-priority-select" value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
              {INCIDENT_PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{INCIDENT_PRIORITY_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Description *</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder="Décrivez l'incident…" style={{ ...INPUT, resize: 'none' }} />
          </div>

          <PersonMultiSelect
            label="Enfants concernés"
            placeholder="Rechercher un enfant…"
            options={childrenOptions.map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sublabel: c.fileNumber }))}
            selectedIds={childIds}
            onChange={setChildIds}
          />
          <PersonMultiSelect
            label="Membres du personnel concernés"
            placeholder="Rechercher un membre du personnel…"
            options={staff.map(s => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.role }))}
            selectedIds={staffIds}
            onChange={setStaffIds}
          />
          <PersonMultiSelect
            label="Locaux concernés"
            placeholder="Rechercher un local…"
            options={spaces.map(s => ({ id: s.id, label: s.name, sublabel: SPACE_TYPE_LABELS[s.type] }))}
            selectedIds={spaceIds}
            onChange={setSpaceIds}
          />

          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Pièce jointe {isEdit && initial?.attachmentKey ? '(remplacer)' : '(optionnel)'}
            </label>
            <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
              style={{ border: `1px solid ${file ? '#A7F3D0' : '#E5E7EB'}`, background: file ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
              <Upload size={14} style={{ color: file ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ flex: 1, color: file ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : isEdit && initial?.attachmentKey ? 'Pièce jointe existante — choisir un fichier pour la remplacer' : 'Joindre une photo ou un document…'}
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
              onSave({
                title: form.title, type: form.type, priority: form.priority,
                description: form.description, date: form.date, childIds, staffIds, spaceIds,
              }, file);
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

// ─── Status change modal (note mandatory) ────────────────────────────────────

function StatusChangeModal({ incident, onSave, onClose }: {
  incident: ApiIncident;
  onSave: (status: ApiIncidentStatus, note: string) => void;
  onClose: () => void;
}) {
  const targets = SELECTABLE_INCIDENT_STATUSES.filter(s => s !== incident.status);
  const [status, setStatus] = useState<ApiIncidentStatus>(targets[0] ?? 'EN_COURS');
  const [note, setNote] = useState('');
  const canSave = note.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="status-change-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Changer le statut</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nouveau statut</label>
            <select data-testid="incident-status-select" value={status} onChange={e => setStatus(e.target.value as ApiIncidentStatus)} style={{ ...INPUT, cursor: 'pointer' }}>
              {targets.map(s => <option key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Note *  <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(obligatoire)</span>
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Expliquez ce changement de statut…" style={{ ...INPUT, resize: 'none' }} autoFocus />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={() => canSave && onSave(status, note.trim())}
            className="flex-1 py-2.5 rounded-lg"
            style={{
              background: canSave ? '#065F46' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
            }}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailModal({ incident, canEdit, canChangeStatus, onClose, onChangeStatus, onEdit, onDelete }: {
  incident: ApiIncident;
  canEdit: boolean;
  canChangeStatus: boolean;
  onClose: () => void;
  onChangeStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isSupervisorCreated = incident.createdBy?.role === 'SUPERVISOR';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="incident-detail-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col"
        style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <StatusBadge status={incident.status} />
              <PriorityBadge priority={incident.priority} />
              <CategoryBadge type={incident.type} />
              {isSupervisorCreated && <SupervisorBadge />}
            </div>
            <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{incident.title}</h3>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
              Signalé par {incident.signaledBy} · {fmtDate(incident.date)}
            </p>
          </div>
          {incident.attachmentKey && (
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
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>DESCRIPTION</p>
            <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{incident.description || '—'}</p>
          </div>

          {(incident.children.length > 0 || incident.staffLinks.length > 0) && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>PERSONNES CONCERNÉES</p>
              <div className="flex flex-wrap gap-1.5">
                {incident.children.map(c => (
                  <span key={c.child.id} className="px-2.5 py-1 rounded-full"
                    style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
                    👶 {c.child.firstName} {c.child.lastName}
                  </span>
                ))}
                {incident.staffLinks.map(s => (
                  <span key={s.staffMember.id} className="px-2.5 py-1 rounded-full"
                    style={{ background: '#F5F3FF', color: '#7C3AED', fontSize: 12, fontWeight: 500 }}>
                    🧑‍💼 {s.staffMember.firstName} {s.staffMember.lastName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {incident.spaces.length > 0 && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>LOCAUX CONCERNÉS</p>
              <div className="flex flex-wrap gap-1.5">
                {incident.spaces.map(s => (
                  <span key={s.space.id} className="px-2.5 py-1 rounded-full"
                    style={{ background: '#FFFBEB', color: '#B45309', fontSize: 12, fontWeight: 500 }}>
                    🏠 {s.space.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {incident.statusHistory.length > 0 && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>
                <History size={11} className="inline mr-1" /> HISTORIQUE DES STATUTS
              </p>
              <div className="space-y-3">
                {incident.statusHistory.map(h => (
                  <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600 }}>
                      {INCIDENT_STATUS_LABELS[h.previousStatus]} → {INCIDENT_STATUS_LABELS[h.newStatus]}
                    </p>
                    <p style={{ color: '#374151', fontSize: 13, marginTop: 3 }}>{h.note}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>{h.user.name} · {fmtDateTime(h.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {incident.notes.length > 0 && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>ANCIENNES NOTES</p>
              <div className="space-y-3">
                {incident.notes.map(note => (
                  <div key={note.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                    <p style={{ color: '#1A1A1A', fontSize: 13 }}>{note.text}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>{note.author} · {fmtDate(note.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — director actions */}
        {(canEdit || canChangeStatus) && (
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
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
                </>
              )}
            </div>
            {canChangeStatus && (
              <button
                onClick={onChangeStatus}
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <CheckCircle2 size={14} /> Changer le statut
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
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [childrenList, setChildrenList] = useState<ApiChildSummary[]>([]);
  const [staffList, setStaffList] = useState<ApiStaffMember[]>([]);
  const [spacesList, setSpacesList] = useState<ApiSpace[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApiIncidentStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ApiIncidentPriority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ApiIncidentType | 'all'>('all');
  const [childFilter, setChildFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [spaceFilter, setSpaceFilter] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiIncident | null>(null);
  const [detail, setDetail] = useState<ApiIncident | null>(null);
  const [statusTarget, setStatusTarget] = useState<ApiIncident | null>(null);

  // Deep-link support for the Director Dashboard's "Demandes à traiter"
  // section: its "Voir" button navigates here with ?open=<incidentId>,
  // which auto-opens this exact, unmodified DetailModal — reusing the
  // page's own existing detail view rather than building a second one.
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    incidentsApi.list().then(setIncidents).catch(() => toast.error('Erreur de chargement des incidents.'));
    childrenApi.list().then(setChildrenList).catch(() => {});
    teamApi.listStaff().then(setStaffList).catch(() => {});
    spacesApi.list().then(setSpacesList).catch(() => {});
  }, []);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || incidents.length === 0) return;
    const target = incidents.find(inc => inc.id === openId);
    if (target) setDetail(target);
    // Strip the param either way so it can't re-trigger on a later render
    // (e.g. after the user closes the modal) or fight a manual selection.
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('open'); return next; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents]);

  const isDirector = user?.role === 'director';
  const canSignal = user?.role === 'director' || user?.role === 'supervisor';

  const visible = useMemo(() => incidents.filter(inc => {
    if (statusFilter !== 'all' && inc.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && inc.priority !== priorityFilter) return false;
    if (categoryFilter !== 'all' && inc.type !== categoryFilter) return false;
    if (childFilter !== 'all' && !inc.children.some(c => c.child.id === childFilter)) return false;
    if (staffFilter !== 'all' && !inc.staffLinks.some(s => s.staffMember.id === staffFilter)) return false;
    if (spaceFilter !== 'all' && !inc.spaces.some(s => s.space.id === spaceFilter)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!inc.title.toLowerCase().includes(q) && !(inc.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [incidents, statusFilter, priorityFilter, categoryFilter, childFilter, staffFilter, spaceFilter, search]);

  const counts = {
    all: incidents.length,
    resolved: incidents.filter(i => i.status === 'RESOLU').length,
    open: incidents.filter(i => i.status === 'EN_COURS' || i.status === 'EN_ATTENTE').length,
  };

  const addIncident = async (form: Omit<CreateIncidentInput, 'signaledBy'>, file: File | null) => {
    try {
      let created = await incidentsApi.create({ ...form, signaledBy: user?.name ?? 'Utilisateur' });
      if (file) created = await incidentsApi.uploadAttachment(created.id, file);
      setIncidents(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success('Incident signalé.');
    } catch {
      toast.error("Erreur lors de la création de l'incident.");
    }
  };

  const updateIncident = async (form: Omit<CreateIncidentInput, 'signaledBy'>, file: File | null) => {
    if (!editTarget) return;
    try {
      let updated = await incidentsApi.update(editTarget.id, form);
      if (file) updated = await incidentsApi.uploadAttachment(editTarget.id, file);
      setIncidents(prev => prev.map(inc => inc.id === updated.id ? updated : inc));
      setDetail(prev => prev && prev.id === updated.id ? updated : prev);
      setEditTarget(null);
      toast.success('Incident modifié.');
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

  const changeStatus = async (status: ApiIncidentStatus, note: string) => {
    if (!statusTarget) return;
    try {
      const updated = await incidentsApi.changeStatus(statusTarget.id, status, note);
      setIncidents(prev => prev.map(inc => inc.id === updated.id ? updated : inc));
      setDetail(updated);
      setStatusTarget(null);
      toast.success('Statut mis à jour.');
    } catch {
      toast.error('Erreur lors du changement de statut.');
    }
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Suivi des incidents</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {counts.open} en cours · {counts.all} total
          </p>
        </div>
        {canSignal && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#B91C1C', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Signaler un incident
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un incident…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select data-testid="filter-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as ApiIncidentStatus | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les statuts</option>
          {(['EN_COURS', 'EN_ATTENTE', 'RESOLU'] as ApiIncidentStatus[]).map(s => <option key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</option>)}
        </select>
        <select data-testid="filter-priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as ApiIncidentPriority | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Toutes les priorités</option>
          {INCIDENT_PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{INCIDENT_PRIORITY_LABELS[p]}</option>)}
        </select>
        <select data-testid="filter-category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as ApiIncidentType | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Toutes les catégories</option>
          {INCIDENT_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{INCIDENT_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select data-testid="filter-child" value={childFilter} onChange={e => setChildFilter(e.target.value)}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les enfants</option>
          {childrenList.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
        </select>
        <select data-testid="filter-staff" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tout le personnel</option>
          {staffList.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
        </select>
        <select data-testid="filter-location" value={spaceFilter} onChange={e => setSpaceFilter(e.target.value)}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les locaux</option>
          {spacesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Incidents list */}
      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <CheckCircle2 size={28} style={{ color: '#065F46', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun incident ne correspond à ces filtres</p>
          </div>
        ) : visible.map(inc => {
          const isSupervisorCreated = inc.createdBy?.role === 'SUPERVISOR';
          return (
            <div key={inc.id} data-testid={`incident-card-${inc.id}`} className="rounded-xl p-4 sm:p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: `1px solid ${isSupervisorCreated ? '#FED7AA' : '#E5E7EB'}` }}
              onClick={() => setDetail(inc)}>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <StatusBadge status={inc.status} />
                    <PriorityBadge priority={inc.priority} />
                    <CategoryBadge type={inc.type} />
                    {isSupervisorCreated && <SupervisorBadge />}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{inc.title}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    Signalé par {inc.signaledBy} · {fmtDate(inc.date)}
                  </p>
                  {inc.description && (
                    <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }} className="line-clamp-2">
                      {inc.description}
                    </p>
                  )}
                  {(inc.children.length > 0 || inc.staffLinks.length > 0 || inc.spaces.length > 0) && (
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>
                      {incidentConcernedSummary(inc)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
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
      {showCreate && (
        <IncidentModal
          childrenOptions={childrenList}
          staff={staffList}
          spaces={spacesList}
          onSave={addIncident}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <IncidentModal
          initial={editTarget}
          childrenOptions={childrenList}
          staff={staffList}
          spaces={spacesList}
          onSave={updateIncident}
          onClose={() => setEditTarget(null)}
        />
      )}
      {detail && (
        <DetailModal
          incident={detail}
          canEdit={isDirector}
          canChangeStatus={isDirector}
          onClose={() => setDetail(null)}
          onChangeStatus={() => setStatusTarget(detail)}
          onEdit={() => { setEditTarget(detail); setDetail(null); }}
          onDelete={() => deleteIncident(detail.id)}
        />
      )}
      {statusTarget && (
        <StatusChangeModal
          incident={statusTarget}
          onSave={changeStatus}
          onClose={() => setStatusTarget(null)}
        />
      )}
    </div>
  );
}
