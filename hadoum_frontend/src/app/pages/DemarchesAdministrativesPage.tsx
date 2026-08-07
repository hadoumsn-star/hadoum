import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  administrativeProceduresApi,
  type ApiAdministrativeProcedure, type ApiAdministrativeProcedureDetail,
  type ApiProcedureType, type ApiProcedureStatus, type ApiProcedurePriority, type ApiProcedureDocumentType,
  type CreateAdministrativeProcedureInput,
} from '../services/administrativeProcedures.api';
import type { ApiValidationRequest } from '../services/maintenanceTickets.api';
import {
  PROCEDURE_TYPE_LABELS, PROCEDURE_TYPE_OPTIONS,
  PROCEDURE_STATUS_LABELS, PROCEDURE_STATUS_STYLE,
  PROCEDURE_MANUAL_STATUS_OPTIONS,
  PROCEDURE_PRIORITY_LABELS, PROCEDURE_PRIORITY_OPTIONS, PROCEDURE_PRIORITY_STYLE,
  PROCEDURE_DOCUMENT_TYPE_LABELS, PROCEDURE_DOCUMENT_TYPE_OPTIONS,
  PENDING_PROCEDURE_ACTION_LABELS,
} from '../config/administrativeProcedures.config';
import { VALIDATION_STATUS_LABELS, VALIDATION_STATUS_STYLE } from '../config/validations.config';
import { ContactAutocomplete } from '../components/contacts/ContactAutocomplete';
import { categoryBadgeStyle } from '../components/contacts/contacts.utils';
import type { ApiContactLike } from '../types/contacts.types';
import {
  Plus, X, Search, Eye, Pencil, Landmark, Archive, CheckCircle2,
  Upload, Paperclip, Trash2, Send, ShieldCheck, ShieldAlert, MessageSquareWarning,
  RefreshCw, Clock, AlertTriangle, ShieldQuestion,
} from 'lucide-react';

// Categories relevant to a procedure's Responsable — resolved by key
// through ContactAutocomplete's own categoryKeys prop, same convention as
// TICKET_PROVIDER_CATEGORY_KEYS / SUPPLIER_CATEGORY_KEYS elsewhere.
const PROCEDURE_RESPONSIBLE_CATEGORY_KEYS = ['ADMINISTRATION', 'PRESTATAIRE', 'SOCIAL'];

// PR 9 priority: linked Contact's name > legacy free-text snapshot.
function procedureResponsibleLabel(procedure: ApiAdministrativeProcedure): string | null {
  return procedure.assignedContact?.fullName || procedure.assignedTo || null;
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const ERROR_TEXT: React.CSSProperties = { color: '#B91C1C', fontSize: 11, marginTop: 4 };

// ─── Deadline badges ────────────────────────────────────────────────────────────

function deadlineBadges(p: ApiAdministrativeProcedure): { label: string; bg: string; color: string }[] {
  const badges: { label: string; bg: string; color: string }[] = [];
  if (p.isExpired) badges.push({ label: 'Expirée', bg: '#FEF2F2', color: '#B91C1C' });
  else if (p.isExpiringSoon) badges.push({ label: 'Expire bientôt', bg: '#FFFBEB', color: '#D97706' });
  if (p.isResponseOverdue) badges.push({ label: 'Réponse en retard', bg: '#FEF2F2', color: '#B91C1C' });
  if (p.isRenewalDueSoon) badges.push({ label: 'Renouvellement proche', bg: '#F5F3FF', color: '#7C3AED' });
  return badges;
}

function submitActionLabel(status: ApiAdministrativeProcedure['status']): string {
  return status === 'SOUMIS' || status === 'EN_ATTENTE_REPONSE'
    ? 'Soumettre pour approbation finale'
    : 'Soumettre pour validation';
}

// ─── Create / Edit modal ────────────────────────────────────────────────────────

function ProcedureModal({ initial, onSave, onClose }: {
  initial?: ApiAdministrativeProcedure;
  onSave: (data: CreateAdministrativeProcedureInput) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    procedureType: initial?.procedureType ?? ('AUTRE' as ApiProcedureType),
    authority: initial?.authority ?? '',
    status: initial?.status ?? ('A_PREPARER' as ApiProcedureStatus),
    description: initial?.description ?? '',
    referenceNumber: initial?.referenceNumber ?? '',
    submissionDate: initial?.submissionDate?.slice(0, 10) ?? '',
    expectedResponseDate: initial?.expectedResponseDate?.slice(0, 10) ?? '',
    expirationDate: initial?.expirationDate?.slice(0, 10) ?? '',
    renewalDate: initial?.renewalDate?.slice(0, 10) ?? '',
    priority: initial?.priority ?? ('NORMALE' as ApiProcedurePriority),
    notes: initial?.notes ?? '',
    pendingResponseOrganization: initial?.pendingResponseOrganization ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // "Statut de suivi" is only a free dropdown while the procedure is still
  // in a pre-submission, operational-tracking state (A_PREPARER / EN_COURS
  // / EN_ATTENTE_REPONSE — a new procedure always starts there). Once it's
  // gone through the validation workflow (SOUMIS, APPROUVE, REFUSE, EXPIRE,
  // ARCHIVE) the status is read-only here and only changes via the
  // Soumettre/Approuver/Refuser/Archiver actions in the detail view — the
  // same rule the backend enforces (see MANUALLY_SETTABLE_STATUSES).
  const statusIsManuallyEditable =
    !isEdit || PROCEDURE_MANUAL_STATUS_OPTIONS.includes(initial!.status);
  const showPendingResponseOrganization = form.status === 'EN_ATTENTE_REPONSE';

  // Separate from `form` because ContactAutocomplete is controlled by an id
  // + the full contact object together. `undefined` = untouched this
  // session (omitted from the payload, existing relation left alone);
  // `null` = explicitly cleared; a string = assigned/replaced.
  const [assignedContactId, setAssignedContactId] = useState<string | null | undefined>(
    initial?.assignedContactId ?? undefined,
  );
  const [assignedContact, setAssignedContact] = useState<ApiContactLike | null>(
    initial?.assignedContact ?? null,
  );
  // A pre-PR-9 procedure can have free-text assignedTo with no linked
  // Contact. Selecting any contact in this session — even before saving —
  // resolves that state, so the notice disappears immediately.
  const showLegacyResponsibleNotice =
    isEdit && !!initial?.assignedTo && !initial?.assignedContactId && !assignedContact;

  const dateError =
    form.submissionDate && form.expectedResponseDate && form.expectedResponseDate < form.submissionDate
      ? 'La date de réponse attendue ne peut pas précéder la date de soumission.'
      : form.submissionDate && form.expirationDate && form.expirationDate < form.submissionDate
        ? "La date d'expiration ne peut pas précéder la date de soumission."
        : form.renewalDate && form.expirationDate && form.renewalDate > form.expirationDate
          ? "La date de renouvellement doit être antérieure ou égale à la date d'expiration."
          : null;

  const canSave =
    form.title.trim().length > 0 && form.authority.trim().length > 0 && !dateError && !saving &&
    (!showPendingResponseOrganization || form.pendingResponseOrganization.trim().length > 0);

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      title: form.title.trim(),
      procedureType: form.procedureType,
      authority: form.authority.trim(),
      // Omitted entirely (not even sent as unchanged) once the status has
      // left manual-tracking territory — the backend would reject it, and
      // there's nothing to change here anyway (see statusIsManuallyEditable).
      ...(statusIsManuallyEditable ? { status: form.status } : {}),
      description: form.description.trim() || undefined,
      referenceNumber: form.referenceNumber.trim() || undefined,
      submissionDate: form.submissionDate || undefined,
      expectedResponseDate: form.expectedResponseDate || undefined,
      expirationDate: form.expirationDate || undefined,
      renewalDate: form.renewalDate || undefined,
      priority: form.priority,
      assignedContactId,
      notes: form.notes.trim() || undefined,
      // Only sent while "En attente de réponse" is selected — left
      // untouched otherwise (a prior value from an earlier "en attente"
      // episode is harmless to keep, and clearing it isn't the point here).
      ...(showPendingResponseOrganization
        ? { pendingResponseOrganization: form.pendingResponseOrganization.trim() }
        : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="procedure-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Modifier la démarche' : 'Nouvelle démarche'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Démarche *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex : Agrément DGPJS" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type</label>
              <select value={form.procedureType} onChange={e => set('procedureType', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {PROCEDURE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{PROCEDURE_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Priorité</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {PROCEDURE_PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PROCEDURE_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Statut de suivi</label>
            {statusIsManuallyEditable ? (
              <select value={form.status} onChange={e => set('status', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}
                data-testid="procedure-status-select">
                {PROCEDURE_MANUAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{PROCEDURE_STATUS_LABELS[s]}</option>)}
              </select>
            ) : (
              <p style={{ color: '#6B7280', fontSize: 13, padding: '8px 12px', background: '#F9F7F3', borderRadius: 8 }}>
                {PROCEDURE_STATUS_LABELS[form.status]} — géré par le circuit de validation (voir la fiche détaillée).
              </p>
            )}
          </div>
          {showPendingResponseOrganization && (
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Organisme concerné *</label>
              <input value={form.pendingResponseOrganization} onChange={e => set('pendingResponseOrganization', e.target.value)}
                placeholder="Ex : Mairie, Préfecture, CAF, Tribunal, Police, Ambassade, Assurance, Banque, Autre…"
                style={INPUT} data-testid="procedure-pending-response-organization" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Autorité *</label>
              <input value={form.authority} onChange={e => set('authority', e.target.value)} placeholder="Ex : DGPJS" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>N° de référence</label>
              <input value={form.referenceNumber} onChange={e => set('referenceNumber', e.target.value)} placeholder="Ex : REF-2026-014" style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Décrivez la démarche…" style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de soumission (date de dépôt)</label>
              <input type="date" value={form.submissionDate} onChange={e => set('submissionDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Réponse attendue le</label>
              <input type="date" value={form.expectedResponseDate} onChange={e => set('expectedResponseDate', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date d'expiration</label>
              <input type="date" value={form.expirationDate} onChange={e => set('expirationDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de renouvellement</label>
              <input type="date" value={form.renewalDate} onChange={e => set('renewalDate', e.target.value)} style={INPUT} />
            </div>
          </div>
          {dateError && <p style={ERROR_TEXT}>{dateError}</p>}
          <div>
            <ContactAutocomplete
              label="Responsable de la démarche"
              placeholder="Rechercher un responsable"
              value={assignedContactId ?? null}
              selectedContact={assignedContact}
              onChange={contact => {
                setAssignedContact(contact);
                setAssignedContactId(contact?.id ?? null);
              }}
              allowCreate
              includeInactiveSelected
              categoryKeys={PROCEDURE_RESPONSIBLE_CATEGORY_KEYS}
            />
            {showLegacyResponsibleNotice && (
              <p style={{ color: '#D97706', fontSize: 11, marginTop: 5 }}>
                Responsable actuel : {initial?.assignedTo} — non lié au répertoire
              </p>
            )}
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
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
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation decision modal (approve / reject / request-changes) ───────────

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="validation-decision-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{cfg.title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5">
          <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
            Commentaire {cfg.commentRequired ? '*' : '(optionnel)'}
          </label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} placeholder="Expliquez votre décision…" style={{ ...INPUT, resize: 'none' }} autoFocus />
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm(comment.trim())}
            className="flex-1 py-2.5 rounded-lg"
            style={{
              background: canConfirm ? cfg.confirmColor : '#E5E7EB',
              color: canConfirm ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}>
            {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Simple confirm-with-optional-comment modal (submit / renew / archive) ────

type RequestAction = 'submit' | 'renew' | 'archive';

function RequestActionModal({ action, title, onConfirm, onClose }: {
  action: RequestAction;
  title: string;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const confirmColor = action === 'archive' ? '#6B7280' : action === 'renew' ? '#065F46' : '#3E5A78';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5">
          <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Commentaire (optionnel)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} placeholder="Précisions à l'attention du superviseur…" style={{ ...INPUT, resize: 'none' }} autoFocus />
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            onClick={() => onConfirm(comment.trim())}
            className="flex-1 py-2.5 rounded-lg"
            style={{ background: confirmColor, color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Envoyer la demande
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail modal ───────────────────────────────────────────────────────────────

function ProcedureDetailModal({ procedureId, isDirector, isSupervisor, onClose, onEdit, onChanged }: {
  procedureId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiAdministrativeProcedureDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<ApiProcedureDocumentType | ''>('');
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);
  const [requestAction, setRequestAction] = useState<RequestAction | null>(null);

  const load = () => Promise.all([
    administrativeProceduresApi.get(procedureId),
    administrativeProceduresApi.history(procedureId),
  ]).then(([d, h]) => { setDetail(d); setHistory(h); })
    .catch(() => toast.error('Erreur lors du chargement de la démarche.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedureId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await administrativeProceduresApi.uploadDocument(procedureId, file, uploadDocType || undefined);
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
      const { url } = await administrativeProceduresApi.getDocumentUrl(procedureId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await administrativeProceduresApi.deleteDocument(procedureId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archiver cette démarche ?')) return;
    try {
      await administrativeProceduresApi.archive(procedureId);
      toast.success('Démarche archivée.');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'archivage.");
    }
  };

  const handleRequestAction = async (comment: string) => {
    if (!requestAction) return;
    try {
      if (requestAction === 'submit') await administrativeProceduresApi.submitValidation(procedureId, comment || undefined);
      if (requestAction === 'renew') await administrativeProceduresApi.requestRenewal(procedureId, comment || undefined);
      if (requestAction === 'archive') await administrativeProceduresApi.requestArchive(procedureId, comment || undefined);
      toast.success('Demande envoyée pour validation.');
      setRequestAction(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi de la demande.");
    }
  };

  const handleDecision = async (comment: string) => {
    if (!decisionAction) return;
    try {
      if (decisionAction === 'approve') await administrativeProceduresApi.approve(procedureId, comment || undefined);
      if (decisionAction === 'reject') await administrativeProceduresApi.reject(procedureId, comment);
      if (decisionAction === 'request-changes') await administrativeProceduresApi.requestChanges(procedureId, comment);
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

  const statusStyle = PROCEDURE_STATUS_STYLE[detail.effectiveStatus];
  const priorityStyle = PROCEDURE_PRIORITY_STYLE[detail.priority];
  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';
  const canSubmit = isDirector && !isPendingValidation &&
    ['A_PREPARER', 'EN_COURS', 'REFUSE', 'SOUMIS', 'EN_ATTENTE_REPONSE'].includes(detail.status);
  const canRequestRenewalOrArchive = isDirector && !isPendingValidation && detail.status !== 'ARCHIVE';
  const badges = deadlineBadges(detail);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="procedure-detail-modal"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                  {PROCEDURE_TYPE_LABELS[detail.procedureType].toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                  {PROCEDURE_STATUS_LABELS[detail.effectiveStatus].toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: priorityStyle.bg, color: priorityStyle.color, fontSize: 10, fontWeight: 700 }}>
                  {PROCEDURE_PRIORITY_LABELS[detail.priority].toUpperCase()}
                </span>
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.title}</h3>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{detail.authority}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Informations générales */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>INFORMATIONS GÉNÉRALES</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{detail.description || '—'}</p>
              {detail.referenceNumber && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>N° référence : {detail.referenceNumber}</p>}
              {(detail.assignedContact || detail.assignedTo) && (
                <div style={{ marginTop: 2 }}>
                  <p style={{ color: '#6B7280', fontSize: 12 }}>
                    Responsable : {procedureResponsibleLabel(detail)}
                    {detail.assignedContact && !detail.assignedContact.active && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 9, fontWeight: 700 }}>
                        INACTIF
                      </span>
                    )}
                  </p>
                  {detail.assignedContact?.organization && (
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{detail.assignedContact.organization}</p>
                  )}
                  {detail.assignedContact?.category && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full"
                      style={{ ...categoryBadgeStyle(detail.assignedContact.category.color), fontSize: 9, fontWeight: 700 }}>
                      {detail.assignedContact.category.label.toUpperCase()}
                    </span>
                  )}
                </div>
              )}
              {detail.createdBy && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Créée par {detail.createdBy.name}</p>}
              {detail.notes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.notes}</p>}
            </div>

            {/* Échéances */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>ÉCHÉANCES</p>
              {badges.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {badges.map(b => (
                    <span key={b.label} className="px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 700 }}>
                      <AlertTriangle size={11} /> {b.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {detail.status === 'EN_ATTENTE_REPONSE' && detail.pendingResponseOrganization && (
                  <p style={{ color: '#C2410C', fontSize: 12, fontWeight: 600 }}>Organisme concerné : {detail.pendingResponseOrganization}</p>
                )}
                {detail.submissionDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Soumission (date de dépôt) : {new Date(detail.submissionDate).toLocaleDateString('fr-FR')}</p>}
                {detail.expectedResponseDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Réponse attendue : {new Date(detail.expectedResponseDate).toLocaleDateString('fr-FR')}</p>}
                {detail.expirationDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Expiration : {new Date(detail.expirationDate).toLocaleDateString('fr-FR')}</p>}
                {detail.renewalDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Renouvellement : {new Date(detail.renewalDate).toLocaleDateString('fr-FR')}</p>}
                {!detail.submissionDate && !detail.expectedResponseDate && !detail.expirationDate && !detail.renewalDate && (
                  <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune échéance renseignée.</p>
                )}
              </div>
            </div>

            {/* Validation */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>VALIDATION</p>
              {detail.pendingValidationAction && (
                <p style={{ color: '#D97706', fontSize: 12, marginBottom: 8 }}>
                  Action demandée : {PENDING_PROCEDURE_ACTION_LABELS[detail.pendingValidationAction] ?? detail.pendingValidationAction}
                </p>
              )}
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours pour cette démarche.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded-full"
                          style={{ background: VALIDATION_STATUS_STYLE[h.status].bg, color: VALIDATION_STATUS_STYLE[h.status].color, fontSize: 10, fontWeight: 700 }}>
                          {VALIDATION_STATUS_LABELS[h.status].toUpperCase()}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                          {new Date(h.reviewedAt ?? h.submittedAt).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <p style={{ color: '#374151', fontSize: 12 }}>
                        Soumis par {h.submittedBy.name}
                        {h.reviewedBy && ` · Examiné par ${h.reviewedBy.name}`}
                      </p>
                      {h.comment && <p style={{ color: '#1A1A1A', fontSize: 13, marginTop: 4 }}>{h.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documents */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>DOCUMENTS</p>
              {detail.documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.label || (doc.documentType ? PROCEDURE_DOCUMENT_TYPE_LABELS[doc.documentType] : 'Document')}
                        </p>
                        {doc.documentType && (
                          <p style={{ color: '#9CA3AF', fontSize: 11 }}>{PROCEDURE_DOCUMENT_TYPE_LABELS[doc.documentType]}</p>
                        )}
                      </div>
                      <button onClick={() => handleViewDocument(doc.id)} title="Voir"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}>
                        <Eye size={14} />
                      </button>
                      {isDirector && (
                        <button onClick={() => handleDeleteDocument(doc.id)} title="Supprimer"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
                <div className="space-y-2">
                  <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value as ApiProcedureDocumentType | '')}
                    style={{ ...INPUT, cursor: 'pointer' }}>
                    <option value="">Type de document (optionnel)</option>
                    {PROCEDURE_DOCUMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{PROCEDURE_DOCUMENT_TYPE_LABELS[t]}</option>)}
                  </select>
                  <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                    style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                    <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>
                      {uploading ? 'Envoi en cours…' : 'Ajouter un document (PDF, image, Office)…'}
                    </span>
                    <input type="file" className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Footer — role-gated actions */}
          {isDirector && (
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <Pencil size={13} /> Modifier
              </button>
              {isPendingValidation ? (
                <span className="px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 13, fontWeight: 600 }}>
                  En attente de validation
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {canSubmit && (
                    <button onClick={() => setRequestAction('submit')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Send size={13} /> {submitActionLabel(detail.status)}
                    </button>
                  )}
                  {canRequestRenewalOrArchive && (
                    <>
                      <button onClick={() => setRequestAction('renew')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#065F46', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={13} /> Renouveler
                      </button>
                      <button onClick={() => setRequestAction('archive')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <ShieldQuestion size={13} /> Demander l'archivage
                      </button>
                      <button onClick={handleArchive}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <Archive size={13} /> Archiver
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {isSupervisor && isPendingValidation && (
            <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={() => setDecisionAction('approve')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <ShieldCheck size={13} /> Approuver
              </button>
              <button onClick={() => setDecisionAction('reject')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <ShieldAlert size={13} /> Refuser
              </button>
              <button onClick={() => setDecisionAction('request-changes')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <MessageSquareWarning size={13} /> Demander des modifications
              </button>
            </div>
          )}
        </div>
      </div>
      {decisionAction && (
        <ValidationDecisionModal action={decisionAction} onConfirm={handleDecision} onClose={() => setDecisionAction(null)} />
      )}
      {requestAction && (
        <RequestActionModal
          action={requestAction}
          title={requestAction === 'submit' ? submitActionLabel(detail.status) : requestAction === 'renew' ? 'Demander le renouvellement' : "Demander l'archivage"}
          onConfirm={handleRequestAction}
          onClose={() => setRequestAction(null)}
        />
      )}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type StatusTab = 'en_cours' | 'en_attente_reponse' | 'a_renouveler' | 'en_retard' | 'pending_validation' | 'expired' | 'all';

export function DemarchesAdministrativesPage() {
  const { user } = useAuth();
  const [procedures, setProcedures] = useState<ApiAdministrativeProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ApiProcedureType | 'all'>('all');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiAdministrativeProcedure | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const isDirector = user?.role === 'director';
  const isSupervisor = user?.role === 'supervisor';

  const load = () => administrativeProceduresApi.list()
    .then(data => { setProcedures(data); setError(false); })
    .catch(() => { setError(true); toast.error('Erreur de chargement des démarches administratives.'); });

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const visible = procedures.filter(p => {
    if (statusTab === 'en_cours' && p.status !== 'EN_COURS') return false;
    if (statusTab === 'en_attente_reponse' && p.effectiveStatus !== 'EN_ATTENTE_REPONSE') return false;
    if (statusTab === 'a_renouveler' && !p.isRenewalDueSoon) return false;
    if (statusTab === 'en_retard' && !p.isResponseOverdue) return false;
    if (statusTab === 'pending_validation' && p.validationStatus !== 'PENDING_VALIDATION') return false;
    if (statusTab === 'expired' && !p.isExpired) return false;
    if (typeFilter !== 'all' && p.procedureType !== typeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.authority.toLowerCase().includes(q)
        && !(p.referenceNumber ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    en_cours: procedures.filter(p => p.status === 'EN_COURS').length,
    en_attente_reponse: procedures.filter(p => p.effectiveStatus === 'EN_ATTENTE_REPONSE').length,
    a_renouveler: procedures.filter(p => p.isRenewalDueSoon).length,
    en_retard: procedures.filter(p => p.isResponseOverdue).length,
    pending_validation: procedures.filter(p => p.validationStatus === 'PENDING_VALIDATION').length,
    expired: procedures.filter(p => p.isExpired).length,
    all: procedures.length,
  };

  const handleCreate = async (data: CreateAdministrativeProcedureInput) => {
    try {
      const created = await administrativeProceduresApi.create(data);
      setProcedures(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success('Démarche créée.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création de la démarche.');
    }
  };

  const handleUpdate = async (data: CreateAdministrativeProcedureInput) => {
    if (!editTarget) return;
    try {
      const updated = await administrativeProceduresApi.update(editTarget.id, data);
      setProcedures(prev => prev.map(p => p.id === updated.id ? updated : p));
      setEditTarget(null);
      toast.success('Démarche modifiée.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la modification de la démarche.');
    }
  };

  const STATUS_TABS: { key: StatusTab; label: string; icon: React.ElementType }[] = [
    { key: 'en_cours',           label: 'En cours',                  icon: Landmark },
    { key: 'en_attente_reponse', label: 'En attente de réponse',     icon: Clock },
    { key: 'a_renouveler',       label: 'À renouveler bientôt',      icon: RefreshCw },
    { key: 'en_retard',          label: 'En retard',                 icon: AlertTriangle },
    { key: 'pending_validation', label: 'En attente de validation',  icon: Send },
    { key: 'expired',            label: 'Expirées',                  icon: ShieldAlert },
    { key: 'all',                label: 'Toutes',                    icon: CheckCircle2 },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Démarches administratives</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            Agréments, déclarations, autorisations, assurances et dossiers administratifs de l'orphelinat.
          </p>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Nouvelle démarche
          </button>
        )}
      </div>

      {/* KPI widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'En cours',                 value: counts.en_cours,           color: '#3E5A78', bg: '#EEF2F7', icon: Landmark },
          { label: 'En attente de réponse',     value: counts.en_attente_reponse, color: '#7C3AED', bg: '#F5F3FF', icon: Clock },
          { label: 'À renouveler bientôt',      value: counts.a_renouveler,       color: '#065F46', bg: '#ECFDF5', icon: RefreshCw },
          { label: 'En retard',                 value: counts.en_retard,          color: '#B91C1C', bg: '#FEF2F2', icon: AlertTriangle },
          { label: 'En attente de validation',  value: counts.pending_validation, color: '#D97706', bg: '#FFFBEB', icon: Send },
          { label: 'Expirées',                  value: counts.expired,            color: '#B91C1C', bg: '#FEF2F2', icon: ShieldAlert },
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une démarche, une autorité, une référence…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as ApiProcedureType | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les types</option>
          {PROCEDURE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{PROCEDURE_TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setStatusTab(key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: statusTab === key ? '#3E5A78' : '#FFFFFF',
              color: statusTab === key ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${statusTab === key ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            {label}
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: statusTab === key ? 'rgba(255,255,255,0.2)' : '#F3F4F6', color: statusTab === key ? '#FFFFFF' : '#6B7280', fontSize: 11, fontWeight: 600 }}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : error ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #FECACA' }}>
            <AlertTriangle size={28} style={{ color: '#B91C1C', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Erreur lors du chargement des démarches</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <Landmark size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune démarche dans cette catégorie</p>
          </div>
        ) : visible.map(procedure => {
          const statusStyle = PROCEDURE_STATUS_STYLE[procedure.effectiveStatus];
          const priorityStyle = PROCEDURE_PRIORITY_STYLE[procedure.priority];
          const badges = deadlineBadges(procedure);
          return (
            <div key={procedure.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: `1px solid ${procedure.isExpired || procedure.isResponseOverdue ? '#FECACA' : '#E5E7EB'}` }}
              onClick={() => setDetailId(procedure.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                      {PROCEDURE_TYPE_LABELS[procedure.procedureType].toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                      {PROCEDURE_STATUS_LABELS[procedure.effectiveStatus].toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded-full" style={{ background: priorityStyle.bg, color: priorityStyle.color, fontSize: 10, fontWeight: 700 }}>
                      {PROCEDURE_PRIORITY_LABELS[procedure.priority].toUpperCase()}
                    </span>
                    {procedure.validationStatus && (
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background: VALIDATION_STATUS_STYLE[procedure.validationStatus].bg, color: VALIDATION_STATUS_STYLE[procedure.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                        {VALIDATION_STATUS_LABELS[procedure.validationStatus].toUpperCase()}
                      </span>
                    )}
                    {badges.map(b => (
                      <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>
                        {b.label.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{procedure.title}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    {procedure.authority}
                    {procedure.referenceNumber && ` · Réf. ${procedure.referenceNumber}`}
                    {procedureResponsibleLabel(procedure) && ` · ${procedureResponsibleLabel(procedure)}`}
                    {procedure.assignedContact && !procedure.assignedContact.active && ' (inactif)'}
                    {procedure.status === 'EN_ATTENTE_REPONSE' && procedure.pendingResponseOrganization &&
                      ` · Organisme : ${procedure.pendingResponseOrganization}`}
                    {procedure.expirationDate && ` · Expiration : ${new Date(procedure.expirationDate).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDetailId(procedure.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                  <Eye size={13} /> Voir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showCreate && (
        <ProcedureModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <ProcedureModal initial={editTarget} onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {detailId && (
        <ProcedureDetailModal
          procedureId={detailId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const target = procedures.find(p => p.id === detailId);
            if (target) setEditTarget(target);
            setDetailId(null);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
