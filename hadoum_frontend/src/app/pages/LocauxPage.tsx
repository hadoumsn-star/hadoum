import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  spacesApi,
  type ApiSpace, type ApiSpaceDetail, type ApiSpaceType, type ApiSpaceCondition,
  type CreateSpaceInput,
} from '../services/spaces.api';
import {
  SPACE_TYPE_LABELS, SPACE_TYPE_OPTIONS,
  SPACE_CONDITION_LABELS, SPACE_CONDITION_OPTIONS, SPACE_CONDITION_STYLE,
} from '../config/spaces.config';
import {
  Plus, X, Search, Eye, Pencil, Archive, Building2,
  Wrench, Upload, Paperclip, Trash2, MapPin,
} from 'lucide-react';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Create / Edit modal ────────────────────────────────────────────────────────

function SpaceModal({ initial, onSave, onClose }: {
  initial?: ApiSpace;
  onSave: (data: CreateSpaceInput) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: initial?.type ?? ('SALLE_CLASSE' as ApiSpaceType),
    description: initial?.description ?? '',
    building: initial?.building ?? '',
    floor: initial?.floor ?? '',
    zone: initial?.zone ?? '',
    condition: initial?.condition ?? ('BON' as ApiSpaceCondition),
    capacity: initial?.capacity != null ? String(initial.capacity) : '',
    equipment: initial?.equipment?.join(', ') ?? '',
    observations: initial?.observations ?? '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const canSave = form.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || undefined,
      building: form.building.trim() || undefined,
      floor: form.floor.trim() || undefined,
      zone: form.zone.trim() || undefined,
      condition: form.condition,
      capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
      equipment: form.equipment.split(',').map(s => s.trim()).filter(Boolean),
      observations: form.observations.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? "Modifier l'espace" : 'Nouvel espace'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Ex : Dortoir Garçons 1" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {SPACE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>État général</label>
              <select value={form.condition} onChange={e => set('condition', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {SPACE_CONDITION_OPTIONS.map(c => <option key={c} value={c}>{SPACE_CONDITION_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Bâtiment</label>
              <input value={form.building} onChange={e => set('building', e.target.value)} placeholder="Bât. A" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Étage</label>
              <input value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="RDC" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Zone</label>
              <input value={form.zone} onChange={e => set('zone', e.target.value)} placeholder="Aile Nord" style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Capacité (personnes)</label>
            <input type="number" min={0} value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="20" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Décrivez l'espace…" style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Équipement (séparé par des virgules)</label>
            <input value={form.equipment} onChange={e => set('equipment', e.target.value)}
              placeholder="Ex : 20 lits, Armoires, Ventilateur" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Observations</label>
            <textarea value={form.observations} onChange={e => set('observations', e.target.value)}
              rows={2} placeholder="Remarques complémentaires…" style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            disabled={!canSave}
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg"
            style={{
              background: canSave ? '#3E5A78' : '#E5E7EB',
              color: canSave ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}>
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail modal ───────────────────────────────────────────────────────────────

function SpaceDetailModal({ spaceId, canManage, onClose, onEdit, onArchive }: {
  spaceId: string;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [detail, setDetail] = useState<ApiSpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => spacesApi.get(spaceId).then(setDetail).catch(() => toast.error("Erreur lors du chargement de l'espace."));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [spaceId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await spacesApi.uploadDocument(spaceId, file);
      await load();
      toast.success('Document ajouté.');
    } catch {
      toast.error("Erreur lors de l'envoi du document.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewDoc = async (docId: string) => {
    try {
      const { url } = await spacesApi.getDocumentUrl(spaceId, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await spacesApi.deleteDocument(spaceId, docId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression du document.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col"
        style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
        {loading || !detail ? (
          <div className="flex items-center justify-center" style={{ height: 300 }}>
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                    {SPACE_TYPE_LABELS[detail.type].toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: SPACE_CONDITION_STYLE[detail.condition].bg, color: SPACE_CONDITION_STYLE[detail.condition].color, fontSize: 10, fontWeight: 700 }}>
                    {SPACE_CONDITION_LABELS[detail.condition].toUpperCase()}
                  </span>
                  {!detail.isActive && (
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>
                      ARCHIVÉ
                    </span>
                  )}
                </div>
                <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.name}</h3>
                {(detail.building || detail.floor || detail.zone) && (
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    <MapPin size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} />
                    {[detail.building, detail.floor, detail.zone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
                <X size={18} style={{ color: '#9CA3AF' }} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* General info */}
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>INFORMATIONS GÉNÉRALES</p>
                <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{detail.description || '—'}</p>
                {detail.capacity != null && (
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Capacité : {detail.capacity} personnes</p>
                )}
                {detail.observations && (
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.observations}</p>
                )}
              </div>

              {/* Equipment */}
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>ÉQUIPEMENT</p>
                {detail.equipment.length === 0 ? (
                  <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun équipement renseigné.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.equipment.map((eq, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full"
                        style={{ background: '#F3F4F6', color: '#374151', fontSize: 12 }}>
                        {eq}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance history / open tickets */}
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>
                  MAINTENANCE — TICKETS OUVERTS ET HISTORIQUE
                </p>
                {detail.maintenanceTickets.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                    <Wrench size={14} style={{ color: '#9CA3AF' }} />
                    <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun ticket de maintenance pour le moment.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.maintenanceTickets.map(t => (
                      <div key={t.id} className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                        <p style={{ color: '#1A1A1A', fontSize: 13 }}>{t.title}</p>
                        <span style={{ color: '#6B7280', fontSize: 11 }}>{new Date(t.reportedDate).toLocaleDateString('fr-FR')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents / photos */}
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>DOCUMENTS ET PHOTOS</p>
                {detail.documents.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {detail.documents.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                        <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                        <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.label || 'Document'}
                        </p>
                        <button onClick={() => handleViewDoc(doc.id)} title="Voir"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}>
                          <Eye size={14} />
                        </button>
                        {canManage && (
                          <button onClick={() => handleDeleteDoc(doc.id)} title="Supprimer"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canManage && (
                  <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                    style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                    <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>
                      {uploading ? 'Envoi en cours…' : 'Ajouter une photo ou un document…'}
                    </span>
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                      disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            </div>

            {/* Footer */}
            {canManage && (
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Pencil size={13} /> Modifier
                </button>
                {detail.isActive && (
                  <button
                    onClick={() => { onArchive(); onClose(); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    <Archive size={13} /> Archiver
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'active' | 'archived';

export function LocauxPage() {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<ApiSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ApiSpaceType | 'all'>('all');
  const [conditionFilter, setConditionFilter] = useState<ApiSpaceCondition | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiSpace | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const isDirector = user?.role === 'director';

  const load = () => spacesApi.list().then(setSpaces).catch(() => toast.error('Erreur de chargement des espaces.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const visible = spaces.filter(s => {
    if (statusFilter === 'active' && !s.isActive) return false;
    if (statusFilter === 'archived' && s.isActive) return false;
    if (typeFilter !== 'all' && s.type !== typeFilter) return false;
    if (conditionFilter !== 'all' && s.condition !== conditionFilter) return false;
    if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: spaces.length,
    active: spaces.filter(s => s.isActive).length,
    archived: spaces.filter(s => !s.isActive).length,
  };

  const handleCreate = async (data: CreateSpaceInput) => {
    try {
      const created = await spacesApi.create(data);
      setSpaces(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success('Espace créé.');
    } catch {
      toast.error("Erreur lors de la création de l'espace.");
    }
  };

  const handleUpdate = async (data: CreateSpaceInput) => {
    if (!editTarget) return;
    try {
      const updated = await spacesApi.update(editTarget.id, data);
      setSpaces(prev => prev.map(s => s.id === updated.id ? updated : s));
      setEditTarget(null);
      toast.success('Espace modifié.');
    } catch {
      toast.error("Erreur lors de la modification de l'espace.");
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archiver cet espace ? Il ne sera plus proposé comme espace actif.')) return;
    try {
      const updated = await spacesApi.archive(id);
      setSpaces(prev => prev.map(s => s.id === id ? updated : s));
      toast.success('Espace archivé.');
    } catch {
      toast.error("Erreur lors de l'archivage de l'espace.");
    }
  };

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'active',   label: 'Actifs' },
    { key: 'archived', label: 'Archivés' },
    { key: 'all',      label: 'Tous' },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Locaux et espaces</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {counts.active} actifs · {spaces.length} total
          </p>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Nouvel espace
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un espace…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as ApiSpaceType | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les types</option>
          {SPACE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>)}
        </select>
        <select value={conditionFilter} onChange={e => setConditionFilter(e.target.value as ApiSpaceCondition | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les états</option>
          {SPACE_CONDITION_OPTIONS.map(c => <option key={c} value={c}>{SPACE_CONDITION_LABELS[c]}</option>)}
        </select>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: statusFilter === key ? '#3E5A78' : '#FFFFFF',
              color: statusFilter === key ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${statusFilter === key ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            {label}
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: statusFilter === key ? 'rgba(255,255,255,0.2)' : '#F3F4F6', color: statusFilter === key ? '#FFFFFF' : '#6B7280', fontSize: 11, fontWeight: 600 }}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <Building2 size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun espace dans cette catégorie</p>
          </div>
        ) : visible.map(space => {
          const cond = SPACE_CONDITION_STYLE[space.condition];
          return (
            <div key={space.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', opacity: space.isActive ? 1 : 0.65 }}
              onClick={() => setDetailId(space.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="px-2 py-0.5 rounded-full"
                      style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                      {SPACE_TYPE_LABELS[space.type].toUpperCase()}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: cond.bg, color: cond.color, fontSize: 10, fontWeight: 700 }}>
                      {SPACE_CONDITION_LABELS[space.condition].toUpperCase()}
                    </span>
                    {!space.isActive && (
                      <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>
                        ARCHIVÉ
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{space.name}</p>
                  {(space.building || space.floor || space.zone) && (
                    <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                      {[space.building, space.floor, space.zone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {space.description && (
                    <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }} className="line-clamp-2">
                      {space.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setDetailId(space.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Eye size={13} /> Voir
                  </button>
                  {isDirector && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setEditTarget(space); }}
                        title="Modifier"
                        className="p-1.5 rounded-lg"
                        style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
                        <Pencil size={14} style={{ color: '#374151' }} />
                      </button>
                      {space.isActive && (
                        <button
                          onClick={e => { e.stopPropagation(); handleArchive(space.id); }}
                          title="Archiver"
                          className="p-1.5 rounded-lg"
                          style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
                          <Archive size={14} style={{ color: '#B91C1C' }} />
                        </button>
                      )}
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
        <SpaceModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <SpaceModal initial={editTarget} onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {detailId && (
        <SpaceDetailModal
          spaceId={detailId}
          canManage={isDirector}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const target = spaces.find(s => s.id === detailId);
            if (target) setEditTarget(target);
            setDetailId(null);
          }}
          onArchive={() => handleArchive(detailId)}
        />
      )}
    </div>
  );
}
