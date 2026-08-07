import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  entryLogsApi,
  type ApiEntryLog, type ApiEntryLogDetail, type ApiEntryType, type ApiVisitorCategory,
  type CreateEntryLogInput,
} from '../services/entryLogs.api';
import {
  goodsMovementLogsApi,
  type ApiGoodsMovementLog, type ApiGoodsMovementLogDetail, type ApiGoodsMovementType,
  type CreateGoodsMovementInput,
} from '../services/goodsMovementLogs.api';
import type { ApiValidationRequest } from '../services/maintenanceTickets.api';
import {
  ENTRY_TYPE_LABELS, ENTRY_TYPE_OPTIONS, VISITOR_CATEGORY_LABELS, VISITOR_CATEGORY_OPTIONS,
  ENTRY_STATUS_LABELS, ENTRY_STATUS_STYLE, PENDING_ENTRY_ACTION_LABELS, formatDuration,
} from '../config/entryLogs.config';
import {
  GOODS_MOVEMENT_TYPE_LABELS, GOODS_MOVEMENT_TYPE_OPTIONS, GOODS_MOVEMENT_STATUS_LABELS,
  GOODS_MOVEMENT_STATUS_STYLE, PENDING_GOODS_ACTION_LABELS,
} from '../config/goodsMovementLogs.config';
import { VALIDATION_STATUS_LABELS, VALIDATION_STATUS_STYLE } from '../config/validations.config';
import {
  Plus, X, Search, Eye, Pencil, Users, Archive, CheckCircle2,
  Upload, Paperclip, Trash2, Send, ShieldCheck, ShieldAlert, MessageSquareWarning,
  Clock, AlertTriangle, LogIn, LogOut, Ban, ShieldQuestion, CalendarClock,
  Package, History as HistoryIcon,
} from 'lucide-react';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = { color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 };
const SECTION_TITLE: React.CSSProperties = { color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 };

// ─── Badges ─────────────────────────────────────────────────────────────────

function entryAlertBadges(e: ApiEntryLog): { label: string; bg: string; color: string }[] {
  const badges: { label: string; bg: string; color: string }[] = [];
  if (e.isExpectedDepartureOverdue) badges.push({ label: 'Départ en retard', bg: '#FEF2F2', color: '#B91C1C' });
  if (e.incidentReported) badges.push({ label: 'Incident', bg: '#FEF2F2', color: '#B91C1C' });
  return badges;
}

function goodsAlertBadges(m: ApiGoodsMovementLog): { label: string; bg: string; color: string }[] {
  const badges: { label: string; bg: string; color: string }[] = [];
  if (m.isOverdueReturn) badges.push({ label: 'Retour en retard', bg: '#FEF2F2', color: '#B91C1C' });
  if (m.incidentReported) badges.push({ label: 'Incident', bg: '#FEF2F2', color: '#B91C1C' });
  return badges;
}

// ─── Create / edit entry log modal ──────────────────────────────────────────

function EntryLogModal({ initial, onSave, onClose }: {
  initial?: ApiEntryLog;
  onSave: (data: CreateEntryLogInput) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    entryType: initial?.entryType ?? ('VISITE_IMPREVUE' as ApiEntryType),
    visitorCategory: initial?.visitorCategory ?? ('VISITEUR' as ApiVisitorCategory),
    fullName: initial?.fullName ?? '',
    organization: initial?.organization ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    identityDocumentType: initial?.identityDocumentType ?? '',
    identityDocumentNumber: initial?.identityDocumentNumber ?? '',
    purpose: initial?.purpose ?? '',
    personVisited: initial?.personVisited ?? '',
    arrivalDateTime: initial?.arrivalDateTime?.slice(0, 16) ?? '',
    expectedDepartureDateTime: initial?.expectedDepartureDateTime?.slice(0, 16) ?? '',
    vehicleRegistration: initial?.vehicleRegistration ?? '',
    accompanyingPersonsCount: initial?.accompanyingPersonsCount != null ? String(initial.accompanyingPersonsCount) : '0',
    authorizedBy: initial?.authorizedBy ?? '',
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const canSave = form.fullName.trim().length > 0 && form.purpose.trim().length > 0 && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      entryType: form.entryType,
      visitorCategory: form.visitorCategory,
      fullName: form.fullName.trim(),
      organization: form.organization.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      identityDocumentType: form.identityDocumentType.trim() || undefined,
      identityDocumentNumber: form.identityDocumentNumber.trim() || undefined,
      purpose: form.purpose.trim(),
      personVisited: form.personVisited.trim() || undefined,
      arrivalDateTime: form.arrivalDateTime || undefined,
      expectedDepartureDateTime: form.expectedDepartureDateTime || undefined,
      vehicleRegistration: form.vehicleRegistration.trim() || undefined,
      accompanyingPersonsCount: form.accompanyingPersonsCount ? parseInt(form.accompanyingPersonsCount, 10) : undefined,
      authorizedBy: form.authorizedBy.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? "Modifier l'enregistrement" : 'Nouvel enregistrement'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Type de mouvement</label>
              <select value={form.entryType} onChange={e => set('entryType', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} disabled={isEdit}>
                {ENTRY_TYPE_OPTIONS.map(t => <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Catégorie</label>
              <select value={form.visitorCategory} onChange={e => set('visitorCategory', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {VISITOR_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{VISITOR_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LABEL}>Nom complet *</label>
            <input value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Ex : Amadou Diop" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Organisation</label>
              <input value={form.organization} onChange={e => set('organization', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Téléphone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Type de pièce d'identité</label>
              <input value={form.identityDocumentType} onChange={e => set('identityDocumentType', e.target.value)} placeholder="Ex : CNI" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>N° de pièce d'identité</label>
              <input value={form.identityDocumentNumber} onChange={e => set('identityDocumentNumber', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={LABEL}>Motif de la visite *</label>
            <textarea value={form.purpose} onChange={e => set('purpose', e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div>
            <label style={LABEL}>Personne visitée</label>
            <input value={form.personVisited} onChange={e => set('personVisited', e.target.value)} style={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>{form.entryType === 'VISITE_PREVUE' ? 'Date/heure prévue' : "Date/heure d'arrivée"}</label>
              <input type="datetime-local" value={form.arrivalDateTime} onChange={e => set('arrivalDateTime', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Départ prévu</label>
              <input type="datetime-local" value={form.expectedDepartureDateTime} onChange={e => set('expectedDepartureDateTime', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Immatriculation véhicule</label>
              <input value={form.vehicleRegistration} onChange={e => set('vehicleRegistration', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Personnes accompagnantes</label>
              <input type="number" min={0} value={form.accompanyingPersonsCount} onChange={e => set('accompanyingPersonsCount', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={LABEL}>Autorisé par</label>
            <input value={form.authorizedBy} onChange={e => set('authorizedBy', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={handleSave} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Simple reason-comment modal (used for check-out / cancel / refuse) ────

type EntryActionMode = 'check-out' | 'cancel' | 'refuse';

function EntryActionModal({ mode, onSubmit, onClose }: {
  mode: EntryActionMode;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const titles: Record<EntryActionMode, string> = {
    'check-out': 'Enregistrer la sortie',
    cancel: 'Annuler la visite',
    refuse: "Refuser l'accès",
  };
  const required = mode === 'refuse';
  const canSubmit = !required || reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{titles[mode]}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5">
          <label style={LABEL}>{mode === 'check-out' ? 'Remarque (optionnel)' : `Motif ${required ? '*' : '(optionnel)'}`}</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} style={{ ...INPUT, resize: 'none' }} autoFocus />
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSubmit || submitting} onClick={handleSubmit} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSubmit ? '#3E5A78' : '#E5E7EB', color: canSubmit ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Envoi…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation decision modal (shared by entries & goods) ─────────────────

type DecisionAction = 'approve' | 'reject' | 'request-changes';

const DECISION_CFG: Record<DecisionAction, { title: string; commentRequired: boolean; confirmLabel: string; confirmColor: string }> = {
  approve:           { title: 'Approuver la demande',        commentRequired: false, confirmLabel: 'Approuver',              confirmColor: '#065F46' },
  reject:            { title: 'Refuser la demande',          commentRequired: true,  confirmLabel: 'Refuser',                confirmColor: '#B91C1C' },
  'request-changes': { title: 'Demander des modifications',  commentRequired: true,  confirmLabel: 'Demander des modifications', confirmColor: '#D97706' },
};

function ValidationDecisionModal({ action, onConfirm, onClose }: {
  action: DecisionAction;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const cfg = DECISION_CFG[action];
  const canConfirm = !cfg.commentRequired || comment.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{cfg.title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5">
          <label style={LABEL}>Commentaire {cfg.commentRequired ? '*' : '(optionnel)'}</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} placeholder="Expliquez votre décision…" style={{ ...INPUT, resize: 'none' }} autoFocus />
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canConfirm} onClick={() => canConfirm && onConfirm(comment.trim())} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canConfirm ? cfg.confirmColor : '#E5E7EB', color: canConfirm ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed' }}>
            {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Entry detail modal ──────────────────────────────────────────────────────

function EntryDetailModal({ entryId, isDirector, isSupervisor, onClose, onEdit, onChanged }: {
  entryId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiEntryLogDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionMode, setActionMode] = useState<EntryActionMode | null>(null);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);

  const load = () => Promise.all([entryLogsApi.get(entryId), entryLogsApi.history(entryId)])
    .then(([d, h]) => { setDetail(d); setHistory(h); })
    .catch(() => toast.error("Erreur lors du chargement de l'enregistrement."));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await entryLogsApi.uploadDocument(entryId, file);
      await load();
      toast.success('Document ajouté.');
    } catch {
      toast.error("Erreur lors de l'envoi du document.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (documentId: string) => {
    try {
      const { url } = await entryLogsApi.getDocumentUrl(entryId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await entryLogsApi.deleteDocument(entryId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleCheckIn = async () => {
    try {
      await entryLogsApi.checkIn(entryId);
      toast.success('Arrivée enregistrée.');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de l'arrivée.");
    }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archiver cet enregistrement ?')) return;
    try {
      const result = await entryLogsApi.archive(entryId);
      toast.success(result.validationStatus === 'PENDING_VALIDATION' ? "Demande d'archivage envoyée pour validation." : 'Enregistrement archivé.');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'archivage.");
    }
  };

  const handleAction = async (reason: string) => {
    if (!actionMode) return;
    try {
      if (actionMode === 'check-out') await entryLogsApi.checkOut(entryId);
      if (actionMode === 'cancel') await entryLogsApi.cancel(entryId, reason || undefined);
      if (actionMode === 'refuse') await entryLogsApi.refuse(entryId, reason);
      toast.success('Opération enregistrée.');
      setActionMode(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'opération.");
    }
  };

  const handleDecision = async (comment: string) => {
    if (!decisionAction) return;
    try {
      if (decisionAction === 'approve') await entryLogsApi.approve(entryId, comment || undefined);
      if (decisionAction === 'reject') await entryLogsApi.reject(entryId, comment);
      if (decisionAction === 'request-changes') await entryLogsApi.requestChanges(entryId, comment);
      toast.success('Décision enregistrée.');
      setDecisionAction(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de la décision.");
    }
  };

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 300 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';
  const isArchived = detail.status === 'ARCHIVEE';
  const statusStyle = ENTRY_STATUS_STYLE[detail.status];
  const badges = entryAlertBadges(detail);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{VISITOR_CATEGORY_LABELS[detail.visitorCategory].toUpperCase()}</span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>{ENTRY_STATUS_LABELS[detail.status].toUpperCase()}</span>
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
                {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.fullName}</h3>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{detail.organization || ENTRY_TYPE_LABELS[detail.entryType]}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0"><X size={18} style={{ color: '#9CA3AF' }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p style={SECTION_TITLE}>INFORMATIONS</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{detail.purpose || '—'}</p>
              {detail.personVisited && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Personne visitée : {detail.personVisited}</p>}
              {detail.phone && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Téléphone : {detail.phone}</p>}
              {detail.identityDocumentNumber && (
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                  {detail.identityDocumentType || 'Pièce'} : {detail.identityDocumentNumber}
                </p>
              )}
              {detail.vehicleRegistration && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Véhicule : {detail.vehicleRegistration}</p>}
              {detail.recordedBy && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Enregistré par {detail.recordedBy.name}</p>}
              {detail.notes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.notes}</p>}
            </div>

            <div>
              <p style={SECTION_TITLE}>PRÉSENCE</p>
              {detail.arrivalDateTime && <p style={{ color: '#6B7280', fontSize: 12 }}>Arrivée : {new Date(detail.arrivalDateTime).toLocaleString('fr-FR')}</p>}
              {detail.expectedDepartureDateTime && <p style={{ color: '#6B7280', fontSize: 12 }}>Départ prévu : {new Date(detail.expectedDepartureDateTime).toLocaleString('fr-FR')}</p>}
              {detail.actualDepartureDateTime && <p style={{ color: '#6B7280', fontSize: 12 }}>Départ effectif : {new Date(detail.actualDepartureDateTime).toLocaleString('fr-FR')}</p>}
              {detail.durationOnSiteMinutes != null && <p style={{ color: '#6B7280', fontSize: 12 }}>Durée sur site : {formatDuration(detail.durationOnSiteMinutes)}</p>}
            </div>

            <div>
              <p style={SECTION_TITLE}>VALIDATION</p>
              {detail.pendingValidationAction && (
                <p style={{ color: '#D97706', fontSize: 12, marginBottom: 8 }}>
                  Action demandée : {PENDING_ENTRY_ACTION_LABELS[detail.pendingValidationAction] ?? detail.pendingValidationAction}
                </p>
              )}
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[h.status].bg, color: VALIDATION_STATUS_STYLE[h.status].color, fontSize: 10, fontWeight: 700 }}>
                          {VALIDATION_STATUS_LABELS[h.status].toUpperCase()}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>{new Date(h.reviewedAt ?? h.submittedAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p style={{ color: '#374151', fontSize: 12 }}>Soumis par {h.submittedBy.name}{h.reviewedBy && ` · Examiné par ${h.reviewedBy.name}`}</p>
                      {h.comment && <p style={{ color: '#1A1A1A', fontSize: 13, marginTop: 4 }}>{h.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={SECTION_TITLE}>DOCUMENTS</p>
              {detail.documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label || 'Document'}</p>
                      <button onClick={() => handleViewDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}><Eye size={14} /></button>
                      {isDirector && <button onClick={() => handleDeleteDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
                <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{uploading ? 'Envoi en cours…' : 'Ajouter un document…'}</span>
                  <input type="file" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>

          {isDirector && !isArchived && (
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Pencil size={13} /> Modifier</button>
              {isPendingValidation ? (
                <span className="px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 13, fontWeight: 600 }}>En attente de validation</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {(detail.status === 'PREVUE' || detail.status === 'REFUSEE') && (
                    <button onClick={handleCheckIn} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><LogIn size={13} /> Enregistrer l'arrivée</button>
                  )}
                  {detail.status === 'PRESENT' && (
                    <button onClick={() => setActionMode('check-out')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><LogOut size={13} /> Enregistrer la sortie</button>
                  )}
                  {detail.status === 'PREVUE' && (
                    <>
                      <button onClick={() => setActionMode('cancel')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Ban size={13} /> Annuler</button>
                      <button onClick={() => setActionMode('refuse')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ShieldQuestion size={13} /> Refuser</button>
                    </>
                  )}
                  <button onClick={handleArchive} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Archive size={13} /> Archiver</button>
                </div>
              )}
            </div>
          )}
          {isSupervisor && isPendingValidation && (
            <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={() => setDecisionAction('approve')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><ShieldCheck size={13} /> Approuver</button>
              <button onClick={() => setDecisionAction('reject')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ShieldAlert size={13} /> Refuser</button>
              <button onClick={() => setDecisionAction('request-changes')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><MessageSquareWarning size={13} /> Demander des modifications</button>
            </div>
          )}
        </div>
      </div>
      {actionMode && <EntryActionModal mode={actionMode} onSubmit={handleAction} onClose={() => setActionMode(null)} />}
      {decisionAction && <ValidationDecisionModal action={decisionAction} onConfirm={handleDecision} onClose={() => setDecisionAction(null)} />}
    </>
  );
}

// ─── Create / edit goods movement modal ──────────────────────────────────────

function GoodsMovementModal({ initial, onSave, onClose }: {
  initial?: ApiGoodsMovementLog;
  onSave: (data: CreateGoodsMovementInput) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    movementType: initial?.movementType ?? ('LIVRAISON' as ApiGoodsMovementType),
    description: initial?.description ?? '',
    itemReference: initial?.itemReference ?? '',
    quantity: initial?.quantity != null ? String(initial.quantity) : '',
    source: initial?.source ?? '',
    destination: initial?.destination ?? '',
    personInCharge: initial?.personInCharge ?? '',
    deliveryNoteNumber: initial?.deliveryNoteNumber ?? '',
    reason: initial?.reason ?? '',
    expectedReturnDate: initial?.expectedReturnDate?.slice(0, 10) ?? '',
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const isCheckoutType = form.movementType === 'PRET_EQUIPEMENT' || form.movementType === 'SORTIE_TEMPORAIRE';
  const canSave = form.description.trim().length > 0 && (!isCheckoutType || form.expectedReturnDate) && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      movementType: form.movementType,
      description: form.description.trim(),
      itemReference: form.itemReference.trim() || undefined,
      quantity: form.quantity ? parseFloat(form.quantity) : undefined,
      source: form.source.trim() || undefined,
      destination: form.destination.trim() || undefined,
      personInCharge: form.personInCharge.trim() || undefined,
      deliveryNoteNumber: form.deliveryNoteNumber.trim() || undefined,
      reason: form.reason.trim() || undefined,
      expectedReturnDate: form.expectedReturnDate || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Nouveau mouvement</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL}>Type de mouvement</label>
            <select value={form.movementType} onChange={e => set('movementType', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
              {GOODS_MOVEMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{GOODS_MOVEMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Description *</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Référence</label>
              <input value={form.itemReference} onChange={e => set('itemReference', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Quantité</label>
              <input type="number" min={0} value={form.quantity} onChange={e => set('quantity', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Source</label>
              <input value={form.source} onChange={e => set('source', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Destination</label>
              <input value={form.destination} onChange={e => set('destination', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Responsable</label>
              <input value={form.personInCharge} onChange={e => set('personInCharge', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>N° bon de livraison</label>
              <input value={form.deliveryNoteNumber} onChange={e => set('deliveryNoteNumber', e.target.value)} style={INPUT} />
            </div>
          </div>
          {isCheckoutType && (
            <div>
              <label style={LABEL}>Retour prévu le *</label>
              <input type="date" value={form.expectedReturnDate} onChange={e => set('expectedReturnDate', e.target.value)} style={INPUT} />
            </div>
          )}
          <div>
            <label style={LABEL}>Motif</label>
            <textarea value={form.reason} onChange={e => set('reason', e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div>
            <label style={LABEL}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={handleSave} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Enregistrement…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Goods detail modal ──────────────────────────────────────────────────────

function GoodsDetailModal({ movementId, isDirector, isSupervisor, onClose, onChanged }: {
  movementId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiGoodsMovementLogDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);

  const load = () => Promise.all([goodsMovementLogsApi.get(movementId), goodsMovementLogsApi.history(movementId)])
    .then(([d, h]) => { setDetail(d); setHistory(h); })
    .catch(() => toast.error('Erreur lors du chargement du mouvement.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await goodsMovementLogsApi.uploadDocument(movementId, file);
      await load();
      toast.success('Document ajouté.');
    } catch {
      toast.error("Erreur lors de l'envoi du document.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (documentId: string) => {
    try {
      const { url } = await goodsMovementLogsApi.getDocumentUrl(movementId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await goodsMovementLogsApi.deleteDocument(movementId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleRecordReturn = async () => {
    if (!window.confirm('Enregistrer le retour de ce bien ?')) return;
    try {
      await goodsMovementLogsApi.recordReturn(movementId);
      toast.success('Retour enregistré.');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du retour.");
    }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archiver ce mouvement ?')) return;
    try {
      const result = await goodsMovementLogsApi.archive(movementId);
      toast.success(result.validationStatus === 'PENDING_VALIDATION' ? "Demande d'archivage envoyée pour validation." : 'Mouvement archivé.');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'archivage.");
    }
  };

  const handleDecision = async (comment: string) => {
    if (!decisionAction) return;
    try {
      if (decisionAction === 'approve') await goodsMovementLogsApi.approve(movementId, comment || undefined);
      if (decisionAction === 'reject') await goodsMovementLogsApi.reject(movementId, comment);
      if (decisionAction === 'request-changes') await goodsMovementLogsApi.requestChanges(movementId, comment);
      toast.success('Décision enregistrée.');
      setDecisionAction(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de la décision.");
    }
  };

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 300 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';
  const isArchived = detail.status === 'ARCHIVE';
  const statusStyle = GOODS_MOVEMENT_STATUS_STYLE[detail.status];
  const badges = goodsAlertBadges(detail);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{GOODS_MOVEMENT_TYPE_LABELS[detail.movementType].toUpperCase()}</span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>{GOODS_MOVEMENT_STATUS_LABELS[detail.status].toUpperCase()}</span>
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
                {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.description}</h3>
              {detail.itemReference && <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>Réf. {detail.itemReference}</p>}
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0"><X size={18} style={{ color: '#9CA3AF' }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p style={SECTION_TITLE}>MOUVEMENT</p>
              {detail.quantity != null && <p style={{ color: '#6B7280', fontSize: 12 }}>Quantité : {detail.quantity}</p>}
              {detail.source && <p style={{ color: '#6B7280', fontSize: 12 }}>Source : {detail.source}</p>}
              {detail.destination && <p style={{ color: '#6B7280', fontSize: 12 }}>Destination : {detail.destination}</p>}
              {detail.personInCharge && <p style={{ color: '#6B7280', fontSize: 12 }}>Responsable : {detail.personInCharge}</p>}
              {detail.stockItem && <p style={{ color: '#6B7280', fontSize: 12 }}>Article lié : {detail.stockItem.name}</p>}
              {detail.inventoryAsset && <p style={{ color: '#6B7280', fontSize: 12 }}>Bien lié : {detail.inventoryAsset.name}</p>}
              <p style={{ color: '#6B7280', fontSize: 12 }}>Date : {new Date(detail.movementDateTime).toLocaleString('fr-FR')}</p>
              {detail.expectedReturnDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Retour prévu : {new Date(detail.expectedReturnDate).toLocaleDateString('fr-FR')}</p>}
              {detail.actualReturnDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Retour effectif : {new Date(detail.actualReturnDate).toLocaleDateString('fr-FR')}</p>}
              {detail.recordedBy && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Enregistré par {detail.recordedBy.name}</p>}
              {detail.notes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.notes}</p>}
            </div>

            <div>
              <p style={SECTION_TITLE}>VALIDATION</p>
              {detail.pendingValidationAction && (
                <p style={{ color: '#D97706', fontSize: 12, marginBottom: 8 }}>
                  Action demandée : {PENDING_GOODS_ACTION_LABELS[detail.pendingValidationAction] ?? detail.pendingValidationAction}
                </p>
              )}
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[h.status].bg, color: VALIDATION_STATUS_STYLE[h.status].color, fontSize: 10, fontWeight: 700 }}>
                          {VALIDATION_STATUS_LABELS[h.status].toUpperCase()}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>{new Date(h.reviewedAt ?? h.submittedAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p style={{ color: '#374151', fontSize: 12 }}>Soumis par {h.submittedBy.name}{h.reviewedBy && ` · Examiné par ${h.reviewedBy.name}`}</p>
                      {h.comment && <p style={{ color: '#1A1A1A', fontSize: 13, marginTop: 4 }}>{h.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={SECTION_TITLE}>DOCUMENTS</p>
              {detail.documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label || 'Document'}</p>
                      <button onClick={() => handleViewDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}><Eye size={14} /></button>
                      {isDirector && <button onClick={() => handleDeleteDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
                <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{uploading ? 'Envoi en cours…' : 'Ajouter un document…'}</span>
                  <input type="file" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>

          {isDirector && !isArchived && (
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              {isPendingValidation ? (
                <span className="px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 13, fontWeight: 600 }}>En attente de validation</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {detail.status === 'SORTI' && (
                    <button onClick={handleRecordReturn} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><LogIn size={13} /> Enregistrer le retour</button>
                  )}
                  <button onClick={handleArchive} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Archive size={13} /> Archiver</button>
                </div>
              )}
            </div>
          )}
          {isSupervisor && isPendingValidation && (
            <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={() => setDecisionAction('approve')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><ShieldCheck size={13} /> Approuver</button>
              <button onClick={() => setDecisionAction('reject')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ShieldAlert size={13} /> Refuser</button>
              <button onClick={() => setDecisionAction('request-changes')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><MessageSquareWarning size={13} /> Demander des modifications</button>
            </div>
          )}
        </div>
      </div>
      {decisionAction && <ValidationDecisionModal action={decisionAction} onConfirm={handleDecision} onClose={() => setDecisionAction(null)} />}
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type MainTab = 'presences' | 'visites-prevues' | 'historique' | 'biens' | 'alertes';

export function RegistreEntreesSortiesPage() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';
  const isSupervisor = user?.role === 'supervisor';

  const [tab, setTab] = useState<MainTab>('presences');
  const [entries, setEntries] = useState<ApiEntryLog[]>([]);
  const [goods, setGoods] = useState<ApiGoodsMovementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [editEntry, setEditEntry] = useState<ApiEntryLog | null>(null);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);

  const [showCreateGoods, setShowCreateGoods] = useState(false);
  const [detailGoodsId, setDetailGoodsId] = useState<string | null>(null);

  const loadAll = () => Promise.all([entryLogsApi.list(), goodsMovementLogsApi.list()])
    .then(([e, g]) => { setEntries(e); setGoods(g); setError(false); })
    .catch(() => { setError(true); toast.error('Erreur de chargement du registre.'); });

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, []);

  const counters = {
    present: entries.filter(e => e.isCurrentlyPresent).length,
    expectedToday: entries.filter(e => e.isVisitExpected).length,
    overdueDeparture: entries.filter(e => e.isExpectedDepartureOverdue).length,
    refused: entries.filter(e => e.status === 'REFUSEE').length,
    activeGoods: goods.filter(g => g.status === 'SORTI').length,
    overdueReturns: goods.filter(g => g.isOverdueReturn).length,
    incidents: entries.filter(e => e.incidentReported).length + goods.filter(g => g.incidentReported).length,
    pendingValidation: entries.filter(e => e.validationStatus === 'PENDING_VALIDATION').length
      + goods.filter(g => g.validationStatus === 'PENDING_VALIDATION').length,
  };

  const matchesSearch = (text: (string | null | undefined)[]) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return text.some(t => (t ?? '').toLowerCase().includes(q));
  };

  const presentEntries = entries.filter(e => e.isCurrentlyPresent && matchesSearch([e.fullName, e.organization, e.purpose]));
  const expectedEntries = entries.filter(e => e.isVisitExpected && matchesSearch([e.fullName, e.organization, e.purpose]));
  const historyEntries = entries.filter(e => matchesSearch([e.fullName, e.organization, e.purpose]));
  const visibleGoods = goods.filter(g => matchesSearch([g.description, g.itemReference, g.personInCharge]));
  const alertEntries = entries.filter(e => e.isExpectedDepartureOverdue || e.incidentReported);
  const alertGoods = goods.filter(g => g.isOverdueReturn || g.incidentReported);

  const handleCreateEntry = async (data: CreateEntryLogInput) => {
    try {
      const created = await entryLogsApi.create(data);
      setEntries(prev => [created, ...prev]);
      setShowCreateEntry(false);
      toast.success('Enregistrement créé.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création de l'enregistrement.");
    }
  };

  const handleUpdateEntry = async (data: CreateEntryLogInput) => {
    if (!editEntry) return;
    try {
      const updated = await entryLogsApi.update(editEntry.id, data);
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      setEditEntry(null);
      toast.success('Enregistrement modifié.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la modification.");
    }
  };

  const handleCreateGoods = async (data: CreateGoodsMovementInput) => {
    try {
      const created = await goodsMovementLogsApi.create(data);
      setGoods(prev => [created, ...prev]);
      setShowCreateGoods(false);
      toast.success('Mouvement créé.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création du mouvement.');
    }
  };

  const TABS: { key: MainTab; label: string; icon: React.ElementType }[] = [
    { key: 'presences',       label: 'Présences actuelles',   icon: Users },
    { key: 'visites-prevues', label: 'Visites prévues',       icon: CalendarClock },
    { key: 'historique',      label: 'Historique visiteurs',  icon: HistoryIcon },
    { key: 'biens',           label: 'Biens et marchandises', icon: Package },
    { key: 'alertes',         label: 'Alertes',               icon: AlertTriangle },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Registre d'entrées/sorties</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          Visiteurs, prestataires, livraisons et mouvements de biens de l'orphelinat.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Personnes présentes',    value: counters.present,          color: '#065F46', bg: '#ECFDF5', icon: Users },
          { label: 'Visites prévues',        value: counters.expectedToday,    color: '#7C3AED', bg: '#F5F3FF', icon: CalendarClock },
          { label: 'Départs en retard',      value: counters.overdueDeparture, color: '#B91C1C', bg: '#FEF2F2', icon: AlertTriangle },
          { label: 'Accès refusés',          value: counters.refused,          color: '#B91C1C', bg: '#FEF2F2', icon: ShieldQuestion },
          { label: 'Mouvements de biens actifs', value: counters.activeGoods,  color: '#3E5A78', bg: '#EEF2F7', icon: Package },
          { label: "Retours en retard",      value: counters.overdueReturns,   color: '#B91C1C', bg: '#FEF2F2', icon: Clock },
          { label: 'Incidents signalés',     value: counters.incidents,        color: '#B91C1C', bg: '#FEF2F2', icon: AlertTriangle },
          { label: 'En attente de validation', value: counters.pendingValidation, color: '#D97706', bg: '#FFFBEB', icon: Send },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-center justify-center rounded-lg mb-2" style={{ width: 32, height: 32, background: kpi.bg }}>
              <kpi.icon size={16} style={{ color: kpi.color }} />
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 20, fontWeight: 700 }}>{kpi.value}</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: tab === key ? '#3E5A78' : '#FFFFFF',
              color: tab === key ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${tab === key ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
      ) : error ? (
        <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #FECACA' }}>
          <AlertTriangle size={28} style={{ color: '#B91C1C', margin: '0 auto 8px' }} />
          <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Erreur lors du chargement</p>
        </div>
      ) : (
        <>
          {(tab === 'presences' || tab === 'visites-prevues' || tab === 'historique') && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un visiteur…" style={{ ...INPUT, paddingLeft: 32 }} />
              </div>
              {isDirector && (
                <button onClick={() => setShowCreateEntry(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
                  style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                  <Plus size={16} /> Nouvel enregistrement
                </button>
              )}
            </div>
          )}

          {tab === 'presences' && (
            <div className="space-y-3">
              {presentEntries.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <Users size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Personne n'est actuellement présent</p>
                </div>
              ) : presentEntries.map(entry => (
                <EntryRow key={entry.id} entry={entry} onClick={() => setDetailEntryId(entry.id)} />
              ))}
            </div>
          )}

          {tab === 'visites-prevues' && (
            <div className="space-y-3">
              {expectedEntries.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <CalendarClock size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune visite prévue</p>
                </div>
              ) : expectedEntries.map(entry => (
                <EntryRow key={entry.id} entry={entry} onClick={() => setDetailEntryId(entry.id)} />
              ))}
            </div>
          )}

          {tab === 'historique' && (
            <div className="space-y-3">
              {historyEntries.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <HistoryIcon size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun enregistrement</p>
                </div>
              ) : historyEntries.map(entry => (
                <EntryRow key={entry.id} entry={entry} onClick={() => setDetailEntryId(entry.id)} />
              ))}
            </div>
          )}

          {tab === 'biens' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un mouvement…" style={{ ...INPUT, paddingLeft: 32 }} />
                </div>
                {isDirector && (
                  <button onClick={() => setShowCreateGoods(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Plus size={16} /> Nouveau mouvement
                  </button>
                )}
              </div>
              {visibleGoods.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <Package size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun mouvement</p>
                </div>
              ) : visibleGoods.map(movement => (
                <GoodsRow key={movement.id} movement={movement} onClick={() => setDetailGoodsId(movement.id)} />
              ))}
            </div>
          )}

          {tab === 'alertes' && (
            <div className="space-y-5">
              <div>
                <p style={{ ...SECTION_TITLE, marginBottom: 10 }}>PERSONNES</p>
                {alertEntries.length === 0 ? (
                  <div className="py-8 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                    <CheckCircle2 size={24} style={{ color: '#065F46', margin: '0 auto 6px' }} />
                    <p style={{ color: '#374151', fontSize: 13 }}>Aucune alerte</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertEntries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA' }} onClick={() => setDetailEntryId(entry.id)}>
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{entry.fullName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {entryAlertBadges(entry).map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label}</span>)}
                          </div>
                        </div>
                        <Eye size={14} style={{ color: '#9CA3AF' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p style={{ ...SECTION_TITLE, marginBottom: 10 }}>BIENS ET MARCHANDISES</p>
                {alertGoods.length === 0 ? (
                  <div className="py-8 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                    <CheckCircle2 size={24} style={{ color: '#065F46', margin: '0 auto 6px' }} />
                    <p style={{ color: '#374151', fontSize: 13 }}>Aucune alerte</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertGoods.map(movement => (
                      <div key={movement.id} className="flex items-center justify-between rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA' }} onClick={() => setDetailGoodsId(movement.id)}>
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{movement.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {goodsAlertBadges(movement).map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label}</span>)}
                          </div>
                        </div>
                        <Eye size={14} style={{ color: '#9CA3AF' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {showCreateEntry && <EntryLogModal onSave={handleCreateEntry} onClose={() => setShowCreateEntry(false)} />}
      {editEntry && <EntryLogModal initial={editEntry} onSave={handleUpdateEntry} onClose={() => setEditEntry(null)} />}
      {detailEntryId && (
        <EntryDetailModal
          entryId={detailEntryId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailEntryId(null)}
          onEdit={() => { const target = entries.find(e => e.id === detailEntryId); if (target) setEditEntry(target); setDetailEntryId(null); }}
          onChanged={loadAll}
        />
      )}
      {showCreateGoods && <GoodsMovementModal onSave={handleCreateGoods} onClose={() => setShowCreateGoods(false)} />}
      {detailGoodsId && (
        <GoodsDetailModal
          movementId={detailGoodsId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailGoodsId(null)}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}

// ─── List row components ─────────────────────────────────────────────────────

function EntryRow({ entry, onClick }: { entry: ApiEntryLog; onClick: () => void }) {
  const statusStyle = ENTRY_STATUS_STYLE[entry.status];
  const badges = entryAlertBadges(entry);
  return (
    <div className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
      style={{ background: '#FFFFFF', border: `1px solid ${entry.isExpectedDepartureOverdue ? '#FECACA' : '#E5E7EB'}` }}
      onClick={onClick}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{VISITOR_CATEGORY_LABELS[entry.visitorCategory].toUpperCase()}</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>{ENTRY_STATUS_LABELS[entry.status].toUpperCase()}</span>
            {entry.validationStatus && (
              <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[entry.validationStatus].bg, color: VALIDATION_STATUS_STYLE[entry.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                {VALIDATION_STATUS_LABELS[entry.validationStatus].toUpperCase()}
              </span>
            )}
            {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
          </div>
          <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{entry.fullName}</p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
            {[entry.organization, entry.purpose, entry.arrivalDateTime ? new Date(entry.arrivalDateTime).toLocaleString('fr-FR') : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button onClick={e => { e.stopPropagation(); onClick(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Eye size={13} /> Voir
        </button>
      </div>
    </div>
  );
}

function GoodsRow({ movement, onClick }: { movement: ApiGoodsMovementLog; onClick: () => void }) {
  const statusStyle = GOODS_MOVEMENT_STATUS_STYLE[movement.status];
  const badges = goodsAlertBadges(movement);
  return (
    <div className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
      style={{ background: '#FFFFFF', border: `1px solid ${movement.isOverdueReturn ? '#FECACA' : '#E5E7EB'}` }}
      onClick={onClick}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{GOODS_MOVEMENT_TYPE_LABELS[movement.movementType].toUpperCase()}</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>{GOODS_MOVEMENT_STATUS_LABELS[movement.status].toUpperCase()}</span>
            {movement.validationStatus && (
              <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[movement.validationStatus].bg, color: VALIDATION_STATUS_STYLE[movement.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                {VALIDATION_STATUS_LABELS[movement.validationStatus].toUpperCase()}
              </span>
            )}
            {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
          </div>
          <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{movement.description}</p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
            {[movement.destination, new Date(movement.movementDateTime).toLocaleDateString('fr-FR')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button onClick={e => { e.stopPropagation(); onClick(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Eye size={13} /> Voir
        </button>
      </div>
    </div>
  );
}
