import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { spacesApi, type ApiSpace } from '../services/spaces.api';
import {
  maintenanceTicketsApi,
  type ApiMaintenanceTicket, type ApiMaintenanceTicketDetail, type ApiValidationRequest,
  type ApiTicketUrgency, type ApiTicketStatus, type CreateMaintenanceTicketInput,
} from '../services/maintenanceTickets.api';
import {
  TICKET_URGENCY_LABELS, TICKET_URGENCY_OPTIONS, TICKET_URGENCY_STYLE,
  TICKET_STATUS_LABELS,
} from '../config/maintenanceTickets.config';
import { VALIDATION_STATUS_LABELS, VALIDATION_STATUS_STYLE } from '../config/validations.config';
import { ContactAutocomplete } from '../components/contacts/ContactAutocomplete';
import { categoryBadgeStyle } from '../components/contacts/contacts.utils';
import type { ApiContactLike } from '../types/contacts.types';
import {
  Plus, X, Search, Eye, Pencil, Wrench, CheckCircle2,
  Upload, Paperclip, Trash2, Send, ShieldCheck, ShieldAlert, MessageSquareWarning,
} from 'lucide-react';

// Categories relevant to a maintenance provider — resolved by key through
// ContactAutocomplete's own categoryKeys prop (against GET /contacts/categories),
// never hardcoded ids.
const TICKET_PROVIDER_CATEGORY_KEYS = ['MAINTENANCE', 'PRESTATAIRE', 'ARTISAN'];

// PR 1-3 priority: linked Contact's name > legacy free-text snapshot > none.
function ticketProviderLabel(ticket: ApiMaintenanceTicket): string {
  return ticket.assignedContact?.fullName || ticket.assignedTo || 'Non assigné';
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Create / Edit modal ────────────────────────────────────────────────────────

function TicketModal({ initial, spaces, onSave, onClose }: {
  initial?: ApiMaintenanceTicket;
  spaces: ApiSpace[];
  onSave: (data: Omit<CreateMaintenanceTicketInput, 'reportedBy'>) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    spaceId: initial?.spaceId ?? (spaces[0]?.id ?? ''),
    urgency: initial?.urgency ?? ('MOYENNE' as ApiTicketUrgency),
    description: initial?.description ?? '',
    problemType: initial?.problemType ?? '',
    plannedDate: initial?.plannedDate?.slice(0, 10) ?? '',
    estimatedCost: initial?.estimatedCost != null ? String(initial.estimatedCost) : '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Separate from `form` because ContactAutocomplete is controlled by an
  // id + the full contact object together, not a single string field like
  // the rest of this form. `undefined` = untouched this session (omitted
  // from the payload, existing relation left alone); `null` = explicitly
  // cleared; a string = assigned/replaced.
  const [assignedContactId, setAssignedContactId] = useState<string | null | undefined>(
    initial?.assignedContactId ?? undefined,
  );
  const [assignedContact, setAssignedContact] = useState<ApiContactLike | null>(
    initial?.assignedContact ?? null,
  );
  // A pre-PR-3 ticket can have free-text assignedTo with no linked Contact.
  // Selecting any contact in this session — even before saving — resolves
  // that state, so the notice disappears immediately rather than waiting
  // for a round-trip.
  const showLegacyProviderNotice =
    isEdit && !!initial?.assignedTo && !initial?.assignedContactId && !assignedContact;

  const canSave = form.title.trim().length > 0 && form.spaceId.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      title: form.title.trim(),
      spaceId: form.spaceId,
      urgency: form.urgency,
      description: form.description.trim() || undefined,
      problemType: form.problemType.trim() || undefined,
      assignedContactId,
      plannedDate: form.plannedDate || undefined,
      estimatedCost: form.estimatedCost ? parseInt(form.estimatedCost, 10) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="ticket-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Modifier le ticket' : 'Nouveau ticket'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Titre *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ex : Fuite d'eau salle de bain" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Espace *</label>
              <select value={form.spaceId} onChange={e => set('spaceId', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Urgence</label>
              <select value={form.urgency} onChange={e => set('urgency', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {TICKET_URGENCY_OPTIONS.map(u => <option key={u} value={u}>{TICKET_URGENCY_LABELS[u]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type de problème</label>
            <input value={form.problemType} onChange={e => set('problemType', e.target.value)} placeholder="Ex : Plomberie" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder="Décrivez le problème…" style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div>
            <ContactAutocomplete
              label="Prestataire assigné"
              placeholder="Rechercher un prestataire"
              value={assignedContactId ?? null}
              selectedContact={assignedContact}
              onChange={contact => {
                setAssignedContact(contact);
                setAssignedContactId(contact?.id ?? null);
              }}
              allowCreate
              includeInactiveSelected={isEdit}
              categoryKeys={TICKET_PROVIDER_CATEGORY_KEYS}
            />
            {showLegacyProviderNotice && (
              <p style={{ color: '#D97706', fontSize: 11, marginTop: 5 }}>
                Prestataire actuel : {initial?.assignedTo} — non lié au répertoire
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date prévue</label>
              <input type="date" value={form.plannedDate} onChange={e => set('plannedDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Coût estimé (FCFA)</label>
              <input type="number" min={0} value={form.estimatedCost} onChange={e => set('estimatedCost', e.target.value)} placeholder="0" style={INPUT} />
            </div>
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

// ─── Validation decision modal (approve / reject / request-changes) ───────────

type DecisionAction = 'approve' | 'reject' | 'request-changes';

const DECISION_CFG: Record<DecisionAction, { title: string; commentRequired: boolean; confirmLabel: string; confirmColor: string }> = {
  approve:          { title: 'Approuver le ticket',            commentRequired: false, confirmLabel: 'Approuver',              confirmColor: '#065F46' },
  reject:           { title: 'Refuser le ticket',               commentRequired: true,  confirmLabel: 'Refuser',                confirmColor: '#B91C1C' },
  'request-changes': { title: 'Demander des modifications',     commentRequired: true,  confirmLabel: 'Demander des modifications', confirmColor: '#D97706' },
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

// ─── Detail modal ───────────────────────────────────────────────────────────────

function TicketDetailModal({ ticketId, isDirector, isSupervisor, onClose, onEdit, onChanged }: {
  ticketId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiMaintenanceTicketDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);

  const load = () => Promise.all([
    maintenanceTicketsApi.get(ticketId),
    maintenanceTicketsApi.history(ticketId),
  ]).then(([d, h]) => { setDetail(d); setHistory(h); })
    .catch(() => toast.error('Erreur lors du chargement du ticket.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [ticketId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await maintenanceTicketsApi.uploadAttachment(ticketId, file);
      await load();
      toast.success('Pièce jointe ajoutée.');
    } catch {
      toast.error("Erreur lors de l'envoi de la pièce jointe.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewAttachment = async (attachmentId: string) => {
    try {
      const { url } = await maintenanceTicketsApi.getAttachmentUrl(ticketId, attachmentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir la pièce jointe.");
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('Supprimer cette pièce jointe ?')) return;
    try {
      await maintenanceTicketsApi.deleteAttachment(ticketId, attachmentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleClose = async () => {
    if (!window.confirm('Clôturer ce ticket ?')) return;
    try {
      await maintenanceTicketsApi.close(ticketId);
      toast.success('Ticket clôturé.');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la clôture.');
    }
  };

  const handleSubmitValidation = async () => {
    if (!window.confirm('Soumettre ce ticket pour validation par le superviseur ?')) return;
    try {
      await maintenanceTicketsApi.submitValidation(ticketId);
      toast.success('Ticket soumis pour validation.');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la soumission.');
    }
  };

  const handleDecision = async (comment: string) => {
    if (!decisionAction) return;
    try {
      if (decisionAction === 'approve') await maintenanceTicketsApi.approve(ticketId, comment || undefined);
      if (decisionAction === 'reject') await maintenanceTicketsApi.reject(ticketId, comment);
      if (decisionAction === 'request-changes') await maintenanceTicketsApi.requestChanges(ticketId, comment);
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

  const urgencyStyle = TICKET_URGENCY_STYLE[detail.urgency];
  const isOpen = detail.status !== 'FERME' && detail.status !== 'ANNULE';
  const canSubmitValidation = detail.urgency === 'CRITIQUE'
    && isOpen
    && detail.validationStatus !== 'PENDING_VALIDATION';
  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="ticket-detail-modal"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: urgencyStyle.bg, color: urgencyStyle.color, fontSize: 10, fontWeight: 700 }}>
                  {TICKET_URGENCY_LABELS[detail.urgency].toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                  {TICKET_STATUS_LABELS[detail.status].toUpperCase()}
                </span>
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.title}</h3>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                {detail.space.name} · Signalé par {detail.reportedBy}
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>DESCRIPTION</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{detail.description || '—'}</p>
              {detail.problemType && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Type : {detail.problemType}</p>}
              {(detail.assignedContact || detail.assignedTo) && (
                <div style={{ marginTop: 2 }}>
                  <p style={{ color: '#6B7280', fontSize: 12 }}>
                    Prestataire assigné : {ticketProviderLabel(detail)}
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
              {detail.estimatedCost != null && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Coût estimé : {detail.estimatedCost.toLocaleString('fr-FR')} FCFA</p>}
              {detail.resolutionNotes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Notes de résolution : {detail.resolutionNotes}</p>}
            </div>

            {/* Validation section */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>VALIDATION</p>
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours pour ce ticket.</p>
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

            {/* Attachments */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>PIÈCES JOINTES</p>
              {detail.attachments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Pièce jointe
                      </p>
                      <button onClick={() => handleViewAttachment(att.id)} title="Voir"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}>
                        <Eye size={14} />
                      </button>
                      {isDirector && (
                        <button onClick={() => handleDeleteAttachment(att.id)} title="Supprimer"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
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
              ) : detail.urgency === 'CRITIQUE' ? (
                canSubmitValidation && (
                  <button onClick={handleSubmitValidation}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    <Send size={13} /> {detail.validationStatus ? 'Modifier et resoumettre' : 'Soumettre pour validation'}
                  </button>
                )
              ) : (
                isOpen && (
                  <button onClick={handleClose}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    <CheckCircle2 size={13} /> Clôturer
                  </button>
                )
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
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type StatusTab = 'open' | 'pending_validation' | 'closed' | 'all';

export function TicketsMaintenancePage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<ApiMaintenanceTicket[]>([]);
  const [spaces, setSpaces] = useState<ApiSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<ApiTicketUrgency | 'all'>('all');
  const [statusTab, setStatusTab] = useState<StatusTab>('open');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiMaintenanceTicket | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const isDirector = user?.role === 'director';
  const isSupervisor = user?.role === 'supervisor';

  const load = () => maintenanceTicketsApi.list().then(setTickets).catch(() => toast.error('Erreur de chargement des tickets.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
    spacesApi.list({ isActive: true }).then(setSpaces).catch(() => {});
  }, []);

  const closedStatuses: ApiTicketStatus[] = ['FERME', 'ANNULE'];

  const visible = tickets.filter(t => {
    if (statusTab === 'open' && closedStatuses.includes(t.status)) return false;
    if (statusTab === 'closed' && !closedStatuses.includes(t.status)) return false;
    if (statusTab === 'pending_validation' && t.validationStatus !== 'PENDING_VALIDATION') return false;
    if (urgencyFilter !== 'all' && t.urgency !== urgencyFilter) return false;
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const counts = {
    open: tickets.filter(t => !closedStatuses.includes(t.status)).length,
    pending_validation: tickets.filter(t => t.validationStatus === 'PENDING_VALIDATION').length,
    closed: tickets.filter(t => closedStatuses.includes(t.status)).length,
    all: tickets.length,
  };

  const handleCreate = async (data: Omit<CreateMaintenanceTicketInput, 'reportedBy'>) => {
    try {
      const created = await maintenanceTicketsApi.create({ ...data, reportedBy: user?.name ?? 'Directrice' });
      setTickets(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success('Ticket créé.');
    } catch {
      toast.error('Erreur lors de la création du ticket.');
    }
  };

  const handleUpdate = async (data: Omit<CreateMaintenanceTicketInput, 'reportedBy'>) => {
    if (!editTarget) return;
    try {
      const updated = await maintenanceTicketsApi.update(editTarget.id, data);
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditTarget(null);
      toast.success('Ticket modifié.');
    } catch {
      toast.error('Erreur lors de la modification du ticket.');
    }
  };

  const STATUS_TABS: { key: StatusTab; label: string }[] = [
    { key: 'open',               label: 'Ouverts' },
    { key: 'pending_validation', label: 'En attente de validation' },
    { key: 'closed',             label: 'Clôturés' },
    { key: 'all',                label: 'Tous' },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Tickets de maintenance</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {counts.open} ouverts · {tickets.length} total
          </p>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Nouveau ticket
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un ticket…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value as ApiTicketUrgency | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Toutes les urgences</option>
          {TICKET_URGENCY_OPTIONS.map(u => <option key={u} value={u}>{TICKET_URGENCY_LABELS[u]}</option>)}
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
        ) : visible.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <Wrench size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun ticket dans cette catégorie</p>
          </div>
        ) : visible.map(ticket => {
          const urgencyStyle = TICKET_URGENCY_STYLE[ticket.urgency];
          return (
            <div key={ticket.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: `1px solid ${ticket.urgency === 'CRITIQUE' ? '#FECACA' : '#E5E7EB'}` }}
              onClick={() => setDetailId(ticket.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: urgencyStyle.bg, color: urgencyStyle.color, fontSize: 10, fontWeight: 700 }}>
                      {TICKET_URGENCY_LABELS[ticket.urgency].toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                      {TICKET_STATUS_LABELS[ticket.status].toUpperCase()}
                    </span>
                    {ticket.validationStatus && (
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background: VALIDATION_STATUS_STYLE[ticket.validationStatus].bg, color: VALIDATION_STATUS_STYLE[ticket.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                        {VALIDATION_STATUS_LABELS[ticket.validationStatus].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{ticket.title}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    {ticket.space.name} · Signalé par {ticket.reportedBy}
                    {ticket.assignedContact || ticket.assignedTo ? (
                      <>
                        {' · '}{ticketProviderLabel(ticket)}
                        {ticket.assignedContact && !ticket.assignedContact.active && ' (inactif)'}
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDetailId(ticket.id); }}
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
        <TicketModal spaces={spaces} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <TicketModal initial={editTarget} spaces={spaces} onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {detailId && (
        <TicketDetailModal
          ticketId={detailId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const target = tickets.find(t => t.id === detailId);
            if (target) setEditTarget(target);
            setDetailId(null);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
