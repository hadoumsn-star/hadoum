import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  supplierContractsApi,
  type ApiSupplierContract, type ApiSupplierContractDetail,
  type ApiContractCategory, type ApiContractStatus, type CreateSupplierContractInput,
} from '../services/supplierContracts.api';
import type { ApiValidationRequest } from '../services/maintenanceTickets.api';
import {
  CONTRACT_CATEGORY_LABELS, CONTRACT_CATEGORY_OPTIONS,
  CONTRACT_STATUS_LABELS, CONTRACT_STATUS_STYLE,
  RENEWAL_TYPE_LABELS, RENEWAL_TYPE_OPTIONS,
  BILLING_FREQUENCY_LABELS, BILLING_FREQUENCY_OPTIONS,
} from '../config/supplierContracts.config';
import { VALIDATION_STATUS_LABELS, VALIDATION_STATUS_STYLE } from '../config/validations.config';
import {
  Plus, X, Search, Eye, Pencil, FileSignature, Archive, CheckCircle2,
  Upload, Paperclip, Trash2, Send, ShieldCheck, ShieldAlert, MessageSquareWarning,
  RefreshCw, Ban, Clock, AlertTriangle,
} from 'lucide-react';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Create / Edit modal ────────────────────────────────────────────────────────

function ContractModal({ initial, onSave, onClose }: {
  initial?: ApiSupplierContract;
  onSave: (data: CreateSupplierContractInput) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    supplierName: initial?.supplierName ?? '',
    contractName: initial?.contractName ?? '',
    category: initial?.category ?? ('AUTRE' as ApiContractCategory),
    description: initial?.description ?? '',
    contractNumber: initial?.contractNumber ?? '',
    startDate: initial?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    renewalDate: initial?.renewalDate?.slice(0, 10) ?? '',
    renewalType: initial?.renewalType ?? '',
    noticePeriod: initial?.noticePeriod != null ? String(initial.noticePeriod) : '',
    amount: initial?.amount != null ? String(initial.amount) : '',
    billingFrequency: initial?.billingFrequency ?? '',
    contactPerson: initial?.contactPerson ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    notes: initial?.notes ?? '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const canSave = form.supplierName.trim().length > 0 && form.contractName.trim().length > 0 && form.startDate.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      supplierName: form.supplierName.trim(),
      contractName: form.contractName.trim(),
      category: form.category,
      description: form.description.trim() || undefined,
      contractNumber: form.contractNumber.trim() || undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      renewalDate: form.renewalDate || undefined,
      renewalType: form.renewalType ? (form.renewalType as CreateSupplierContractInput['renewalType']) : undefined,
      noticePeriod: form.noticePeriod ? parseInt(form.noticePeriod, 10) : undefined,
      amount: form.amount ? parseInt(form.amount, 10) : undefined,
      billingFrequency: form.billingFrequency ? (form.billingFrequency as CreateSupplierContractInput['billingFrequency']) : undefined,
      contactPerson: form.contactPerson.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Modifier le contrat' : 'Nouveau contrat'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Fournisseur *</label>
              <input value={form.supplierName} onChange={e => set('supplierName', e.target.value)} placeholder="Ex : Sénégal Gaz" style={INPUT} autoFocus />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom du contrat *</label>
              <input value={form.contractName} onChange={e => set('contractName', e.target.value)} placeholder="Ex : Fourniture de gaz" style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Catégorie</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {CONTRACT_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CONTRACT_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>N° de contrat</label>
              <input value={form.contractNumber} onChange={e => set('contractNumber', e.target.value)} placeholder="Ex : CT-2026-014" style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Décrivez le contrat…" style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de début *</label>
              <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de fin</label>
              <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de renouvellement</label>
              <input type="date" value={form.renewalDate} onChange={e => set('renewalDate', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type de renouvellement</label>
              <select value={form.renewalType} onChange={e => set('renewalType', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="">—</option>
                {RENEWAL_TYPE_OPTIONS.map(r => <option key={r} value={r}>{RENEWAL_TYPE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Préavis (jours)</label>
              <input type="number" min={0} value={form.noticePeriod} onChange={e => set('noticePeriod', e.target.value)} placeholder="30" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Fréquence facturation</label>
              <select value={form.billingFrequency} onChange={e => set('billingFrequency', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="">—</option>
                {BILLING_FREQUENCY_OPTIONS.map(b => <option key={b} value={b}>{BILLING_FREQUENCY_LABELS[b]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Montant (FCFA)</label>
            <input type="number" min={0} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" style={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Contact</label>
              <input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Nom du contact" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+221 …" style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@fournisseur.com" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Adresse</label>
              <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Adresse du fournisseur" style={INPUT} />
            </div>
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

// ─── Simple confirm-with-optional-comment modal (submit / renew / terminate) ──

type RequestAction = 'submit' | 'renew' | 'terminate';

const REQUEST_CFG: Record<RequestAction, { title: string; confirmLabel: string; confirmColor: string }> = {
  submit:    { title: 'Soumettre pour validation',   confirmLabel: 'Soumettre',  confirmColor: '#3E5A78' },
  renew:     { title: 'Demander le renouvellement',  confirmLabel: 'Demander',   confirmColor: '#065F46' },
  terminate: { title: 'Demander la résiliation',     confirmLabel: 'Demander',   confirmColor: '#B91C1C' },
};

function RequestActionModal({ action, onConfirm, onClose }: {
  action: RequestAction;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const cfg = REQUEST_CFG[action];

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
            style={{ background: cfg.confirmColor, color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail modal ───────────────────────────────────────────────────────────────

const PENDING_ACTION_LABELS: Record<string, string> = {
  CREATION: 'Activation du contrat',
  RENEWAL: 'Renouvellement',
  TERMINATION: 'Résiliation',
};

function ContractDetailModal({ contractId, isDirector, isSupervisor, onClose, onEdit, onChanged }: {
  contractId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiSupplierContractDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);
  const [requestAction, setRequestAction] = useState<RequestAction | null>(null);

  const load = () => Promise.all([
    supplierContractsApi.get(contractId),
    supplierContractsApi.history(contractId),
  ]).then(([d, h]) => { setDetail(d); setHistory(h); })
    .catch(() => toast.error('Erreur lors du chargement du contrat.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [contractId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await supplierContractsApi.uploadDocument(contractId, file);
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
      const { url } = await supplierContractsApi.getDocumentUrl(contractId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await supplierContractsApi.deleteDocument(contractId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archiver ce contrat ?')) return;
    try {
      await supplierContractsApi.archive(contractId);
      toast.success('Contrat archivé.');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'archivage.");
    }
  };

  const handleRequestAction = async (comment: string) => {
    if (!requestAction) return;
    try {
      if (requestAction === 'submit') await supplierContractsApi.submitValidation(contractId, comment || undefined);
      if (requestAction === 'renew') await supplierContractsApi.requestRenewal(contractId, comment || undefined);
      if (requestAction === 'terminate') await supplierContractsApi.requestTermination(contractId, comment || undefined);
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
      if (decisionAction === 'approve') await supplierContractsApi.approve(contractId, comment || undefined);
      if (decisionAction === 'reject') await supplierContractsApi.reject(contractId, comment);
      if (decisionAction === 'request-changes') await supplierContractsApi.requestChanges(contractId, comment);
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

  const statusStyle = CONTRACT_STATUS_STYLE[detail.effectiveStatus];
  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';
  const canRequestActions = isDirector && !isPendingValidation && detail.status !== 'ARCHIVE' && detail.status !== 'RESILIE';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                  {CONTRACT_CATEGORY_LABELS[detail.category].toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                  {CONTRACT_STATUS_LABELS[detail.effectiveStatus].toUpperCase()}
                </span>
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.contractName}</h3>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{detail.supplierName}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>INFORMATIONS GÉNÉRALES</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{detail.description || '—'}</p>
              {detail.contractNumber && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>N° contrat : {detail.contractNumber}</p>}
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                Début : {new Date(detail.startDate).toLocaleDateString('fr-FR')}
                {detail.endDate && ` · Fin : ${new Date(detail.endDate).toLocaleDateString('fr-FR')}`}
              </p>
              {detail.amount != null && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Montant : {detail.amount.toLocaleString('fr-FR')} FCFA</p>}
              {(detail.contactPerson || detail.phone || detail.email) && (
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                  {[detail.contactPerson, detail.phone, detail.email].filter(Boolean).join(' · ')}
                </p>
              )}
              {detail.notes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.notes}</p>}
            </div>

            {/* Validation section */}
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>VALIDATION</p>
              {detail.pendingValidationAction && (
                <p style={{ color: '#D97706', fontSize: 12, marginBottom: 8 }}>
                  Action demandée : {PENDING_ACTION_LABELS[detail.pendingValidationAction] ?? detail.pendingValidationAction}
                </p>
              )}
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours pour ce contrat.</p>
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
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.label || 'Document'}
                      </p>
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
                  {detail.status === 'BROUILLON' && (
                    <button onClick={() => setRequestAction('submit')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Send size={13} /> Soumettre pour validation
                    </button>
                  )}
                  {canRequestActions && detail.status !== 'BROUILLON' && (
                    <>
                      <button onClick={() => setRequestAction('renew')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#065F46', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={13} /> Renouveler
                      </button>
                      <button onClick={() => setRequestAction('terminate')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        <Ban size={13} /> Résilier
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
        <RequestActionModal action={requestAction} onConfirm={handleRequestAction} onClose={() => setRequestAction(null)} />
      )}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type StatusTab = 'active' | 'expiring_soon' | 'expired' | 'pending_validation' | 'all';

export function SupplierContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<ApiSupplierContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ApiContractCategory | 'all'>('all');
  const [statusTab, setStatusTab] = useState<StatusTab>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiSupplierContract | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const isDirector = user?.role === 'director';
  const isSupervisor = user?.role === 'supervisor';

  const load = () => supplierContractsApi.list().then(setContracts).catch(() => toast.error('Erreur de chargement des contrats.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const visible = contracts.filter(c => {
    if (statusTab === 'active' && c.effectiveStatus !== 'ACTIF') return false;
    if (statusTab === 'expiring_soon' && c.effectiveStatus !== 'EXPIRE_BIENTOT') return false;
    if (statusTab === 'expired' && c.effectiveStatus !== 'EXPIRE') return false;
    if (statusTab === 'pending_validation' && c.validationStatus !== 'PENDING_VALIDATION') return false;
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!c.supplierName.toLowerCase().includes(q) && !c.contractName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    active: contracts.filter(c => c.effectiveStatus === 'ACTIF').length,
    expiring_soon: contracts.filter(c => c.effectiveStatus === 'EXPIRE_BIENTOT').length,
    expired: contracts.filter(c => c.effectiveStatus === 'EXPIRE').length,
    pending_validation: contracts.filter(c => c.validationStatus === 'PENDING_VALIDATION').length,
    all: contracts.length,
  };

  const handleCreate = async (data: CreateSupplierContractInput) => {
    try {
      const created = await supplierContractsApi.create(data);
      setContracts(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success(
        created.status === 'BROUILLON'
          ? 'Contrat créé en brouillon — montant élevé, validation requise avant activation.'
          : 'Contrat créé.',
      );
    } catch {
      toast.error('Erreur lors de la création du contrat.');
    }
  };

  const handleUpdate = async (data: CreateSupplierContractInput) => {
    if (!editTarget) return;
    try {
      const updated = await supplierContractsApi.update(editTarget.id, data);
      setContracts(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditTarget(null);
      toast.success('Contrat modifié.');
    } catch {
      toast.error('Erreur lors de la modification du contrat.');
    }
  };

  const STATUS_TABS: { key: StatusTab; label: string; icon: React.ElementType }[] = [
    { key: 'active',              label: 'Actifs',                    icon: CheckCircle2 },
    { key: 'expiring_soon',       label: 'Expirant bientôt',          icon: Clock },
    { key: 'expired',              label: 'Expirés',                   icon: AlertTriangle },
    { key: 'pending_validation',  label: 'En attente de validation',  icon: Send },
    { key: 'all',                  label: 'Tous',                       icon: FileSignature },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Contrats fournisseurs</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {counts.active} actifs · {contracts.length} total
          </p>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Nouveau contrat
          </button>
        )}
      </div>

      {/* KPI widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Actifs',                 value: counts.active,             color: '#065F46', bg: '#ECFDF5', icon: CheckCircle2 },
          { label: 'Expirant bientôt',       value: counts.expiring_soon,      color: '#D97706', bg: '#FFFBEB', icon: Clock },
          { label: 'Expirés',                 value: counts.expired,            color: '#B91C1C', bg: '#FEF2F2', icon: AlertTriangle },
          { label: 'En attente de validation', value: counts.pending_validation, color: '#7C3AED', bg: '#F5F3FF', icon: Send },
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
            placeholder="Rechercher un fournisseur ou un contrat…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as ApiContractCategory | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Toutes les catégories</option>
          {CONTRACT_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CONTRACT_CATEGORY_LABELS[c]}</option>)}
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
            <FileSignature size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun contrat dans cette catégorie</p>
          </div>
        ) : visible.map(contract => {
          const statusStyle = CONTRACT_STATUS_STYLE[contract.effectiveStatus];
          return (
            <div key={contract.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: `1px solid ${contract.effectiveStatus === 'EXPIRE' ? '#FECACA' : '#E5E7EB'}` }}
              onClick={() => setDetailId(contract.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                      {CONTRACT_CATEGORY_LABELS[contract.category].toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                      {CONTRACT_STATUS_LABELS[contract.effectiveStatus].toUpperCase()}
                    </span>
                    {contract.validationStatus && (
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background: VALIDATION_STATUS_STYLE[contract.validationStatus].bg, color: VALIDATION_STATUS_STYLE[contract.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                        {VALIDATION_STATUS_LABELS[contract.validationStatus].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{contract.contractName}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    {contract.supplierName}
                    {contract.endDate && ` · Fin : ${new Date(contract.endDate).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDetailId(contract.id); }}
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
        <ContractModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <ContractModal initial={editTarget} onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {detailId && (
        <ContractDetailModal
          contractId={detailId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const target = contracts.find(c => c.id === detailId);
            if (target) setEditTarget(target);
            setDetailId(null);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
