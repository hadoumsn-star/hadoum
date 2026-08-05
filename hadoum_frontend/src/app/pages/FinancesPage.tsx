import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Plus, X, Check, Eye, Loader2, Trash2, Pencil, FileCheck, AlertTriangle,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  AlertCircle, Upload, Send, CheckCircle2, Ban, History,
} from 'lucide-react';
import {
  financesApi,
  type ApiTransaction, type ApiDashboard, type ApiDashboardCategory, type ApiTransactionType, type ApiExpenseWorkflowStatus,
} from '../services/finances.api';
import {
  CATEGORY_LABELS, CATEGORY_COLORS, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  STATUS_LABELS, STATUS_STYLE, formatXof, formatEur,
  PAYMENT_METHOD_LABELS, PAYMENT_METHODS,
  EXPENSE_WORKFLOW_STATUS_LABELS, EXPENSE_WORKFLOW_STATUS_STYLE,
  type ApiTransactionCategory, type ApiTransactionStatus, type ApiPaymentMethod,
} from '../config/financeCategories.config';
import { ContactAutocomplete } from '../components/contacts/ContactAutocomplete';
import type { ApiContactLike } from '../types/contacts.types';
import { useAuth } from '../context/AuthContext';
import { ExpenseDecisionModal, ValidationHistoryModal, type ExpenseAction } from '../components/finances/ExpenseDecisionModal';
import { PendingExpenseApprovals } from '../components/finances/PendingExpenseApprovals';

// PR 5C: once expenseWorkflowStatus reaches one of these, amount/category/
// date/type are locked server-side (see FinancesService.assertFinancialFieldsUnlocked)
// — mirrored here so the form disables them instead of letting the user hit
// a 409 on save.
const FINANCIALLY_LOCKED_STATES: ApiExpenseWorkflowStatus[] = ['APPROVED', 'COMPLETED', 'CANCELLED'];
// PR 5E: once terminal, the expense is read-only in this UI (no edit/delete/
// workflow actions) — the backend does not enforce this for delete, but the
// product decision for this PR is that a finished expense's paper trail
// should not be editable or removable from the Finance page.
const READ_ONLY_STATES: ApiExpenseWorkflowStatus[] = ['COMPLETED', 'CANCELLED'];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}

const SUPPLIER_CATEGORY_KEYS = ['FOURNISSEUR', 'PRESTATAIRE', 'COMMERCE', 'ARTISAN'];

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function Tt({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg" style={{ background: '#1A1A1A' }}>
      <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 2 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: '#FFFFFF', fontSize: 13 }}>{p.name ?? p.dataKey}: {formatXof(p.value)}</p>
      ))}
    </div>
  );
}

// ─── Document picker (dedicated expense documents) ─────────────────────────────
//
// Shared by the three DEPENSE document fields. Three states: a locally
// picked-but-not-yet-uploaded file, an existing uploaded document (edit
// mode), or empty. "Remplacer"/upload always happens as part of the
// modal's save step (two-stage: save the transaction, then upload) —
// picking a file here never uploads immediately. "Supprimer" on an
// already-uploaded document is the one exception: that's a direct,
// immediate action against a transaction that already exists.

function DocumentPicker({
  label, existingKey, file, onPick, onView, onRemoveExisting, error,
}: {
  label: string;
  existingKey: string | null | undefined;
  file: File | null;
  onPick: (f: File | null) => void;
  onView?: () => void;
  onRemoveExisting?: () => void;
  error?: string;
}) {
  return (
    <div>
      <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>{label}</label>
      {file ? (
        <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ border: '1px solid #A7F3D0', background: 'rgba(6,95,70,0.04)' }}>
          <Upload size={14} style={{ color: '#065F46', flexShrink: 0 }} />
          <span className="flex-1 min-w-0 truncate" style={{ color: '#065F46', fontSize: 13 }}>{file.name}</span>
          <button type="button" onClick={() => onPick(null)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>
      ) : existingKey ? (
        <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
          <FileCheck size={14} style={{ color: '#065F46', flexShrink: 0 }} />
          <span className="flex-1" style={{ color: '#374151', fontSize: 13 }}>Document en ligne</span>
          {onView && (
            <button type="button" onClick={onView}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
              Voir
            </button>
          )}
          <label style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            Remplacer
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onPick(e.target.files?.[0] ?? null)} />
          </label>
          {onRemoveExisting && (
            <button type="button" onClick={onRemoveExisting}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ) : (
        <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
          style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
          <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
          <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>Joindre un fichier…</span>
          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onPick(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {error && <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

// ─── Add / edit transaction modal (dépense or recette) ─────────────────────────
//
// Orchestrates its own API calls (create/update, then any selected document
// uploads) rather than delegating to the parent — needed so a failed
// document upload can be retried in place without re-submitting the whole
// transaction (the transaction itself is always safely saved first).

type DocKind = 'purchaseOrder' | 'invoice' | 'deliveryNote';

function TransactionModal({ type, initial, onSaved, onClose }: {
  type: ApiTransactionType;
  initial?: ApiTransaction;
  onSaved: (t: ApiTransaction) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  // PR 5E: once the expense is APPROVED/COMPLETED/CANCELLED, amount/category/
  // date are locked server-side — disable them here too so the user sees why
  // instead of hitting a 409 on save (see FINANCIALLY_LOCKED_STATES above).
  const financialFieldsLocked = !!initial?.expenseWorkflowStatus
    && FINANCIALLY_LOCKED_STATES.includes(initial.expenseWorkflowStatus);
  // Editing a historical transaction whose category (or payment method,
  // below) predates the current standardized list — e.g. ENTRETIEN/
  // PEDAGOGIE/EQUIPEMENT/AUTRE for DEPENSE, or MOBILE_MONEY — must still show
  // and preserve that value instead of the <select> silently landing on
  // nothing. Only ever appends the record's own current value, never widens
  // what a *new* transaction can pick (`categories[0]`/`''` below stay the
  // defaults for a fresh create).
  const baseCategories = type === 'DEPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const categories = initial && !baseCategories.includes(initial.category)
    ? [...baseCategories, initial.category]
    : baseCategories;
  const [category, setCategory] = useState<ApiTransactionCategory>(initial?.category ?? categories[0]);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amountXof) : '');
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ApiTransactionStatus>(initial?.status ?? 'VALIDE');
  // Same legacy-value handling as `categories` above — e.g. a historical
  // MOBILE_MONEY transaction stays showable/preservable in the edit form.
  const paymentMethods = initial?.paymentMethod && !PAYMENT_METHODS.includes(initial.paymentMethod)
    ? [...PAYMENT_METHODS, initial.paymentMethod]
    : PAYMENT_METHODS;
  const [paymentMethod, setPaymentMethod] = useState<ApiPaymentMethod | ''>(initial?.paymentMethod ?? '');
  const [anonymous, setAnonymous] = useState(initial?.isAnonymousDonor ?? false);
  const [donorName, setDonorName] = useState(initial?.donorName ?? '');

  // DEPENSE: supplier + three dedicated documents.
  const [supplierContactId, setSupplierContactId] = useState<string | null | undefined>(
    initial?.supplierContactId ?? undefined,
  );
  const [supplierContact, setSupplierContact] = useState<ApiContactLike | null>(
    initial?.supplierContact ?? null,
  );
  const [poFile, setPoFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [dnFile, setDnFile] = useState<File | null>(null);

  // RECETTE (and legacy DEPENSE rows): the original single justificatif field.
  const [justifFile, setJustifFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Once the transaction itself is saved, `savedTransaction` drives the
  // view: null means "still editing the form"; non-null with `docErrors`
  // populated means "transaction is safe, some document(s) failed — offer
  // retry"; non-null with no errors never happens as a rendered state (we
  // close immediately in that case).
  const [savedTransaction, setSavedTransaction] = useState<ApiTransaction | null>(null);
  const [docErrors, setDocErrors] = useState<Partial<Record<DocKind, string>>>({});
  const [retrying, setRetrying] = useState<DocKind | null>(null);
  const [currentDocs, setCurrentDocs] = useState({
    purchaseOrderKey: initial?.purchaseOrderKey ?? null,
    invoiceKey: initial?.invoiceKey ?? null,
    deliveryNoteKey: initial?.deliveryNoteKey ?? null,
  });

  const amountNum = parseInt(amount, 10);
  const canSave = label.trim().length > 0 && amountNum > 0 && !!date;

  function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Erreur lors du transfert.';
  }

  const DOC_UPLOAD: Record<DocKind, (id: string, f: File) => Promise<ApiTransaction>> = {
    purchaseOrder: financesApi.uploadPurchaseOrder,
    invoice: financesApi.uploadInvoice,
    deliveryNote: financesApi.uploadDeliveryNote,
  };
  const DOC_KEY_FIELD: Record<DocKind, keyof typeof currentDocs> = {
    purchaseOrder: 'purchaseOrderKey',
    invoice: 'invoiceKey',
    deliveryNote: 'deliveryNoteKey',
  };
  const DOC_FILE: Record<DocKind, File | null> = {
    purchaseOrder: poFile, invoice: invoiceFile, deliveryNote: dnFile,
  };

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setApiError(null);
    try {
      const payload = {
        category, label: label.trim(), amountXof: amountNum, date, status,
        paymentMethod: paymentMethod || undefined,
        ...(type === 'DEPENSE' ? { supplierContactId } : {}),
        ...(type === 'RECETTE'
          ? { isAnonymousDonor: anonymous, donorName: anonymous ? undefined : donorName.trim() || undefined }
          : {}),
      };

      const saved = isEdit
        ? await financesApi.updateTransaction(initial.id, payload)
        : await financesApi.createTransaction({ type, ...payload });

      let final = saved;
      const errors: Partial<Record<DocKind, string>> = {};

      if (type === 'RECETTE' && justifFile) {
        try { final = await financesApi.uploadJustificatif(saved.id, justifFile); }
        catch (e) { toast.error(`Erreur lors de l'envoi du justificatif : ${errorMessage(e)}`); }
      }

      if (type === 'DEPENSE') {
        for (const kind of ['purchaseOrder', 'invoice', 'deliveryNote'] as DocKind[]) {
          const file = DOC_FILE[kind];
          if (!file) continue;
          try {
            final = await DOC_UPLOAD[kind](saved.id, file);
          } catch (e) {
            errors[kind] = errorMessage(e);
          }
        }
      }

      setCurrentDocs({
        purchaseOrderKey: final.purchaseOrderKey,
        invoiceKey: final.invoiceKey,
        deliveryNoteKey: final.deliveryNoteKey,
      });

      if (Object.keys(errors).length > 0) {
        setSavedTransaction(final);
        setDocErrors(errors);
      } else {
        onSaved(final);
        onClose();
      }
    } catch (e) {
      setApiError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function retryDoc(kind: DocKind) {
    const file = DOC_FILE[kind];
    if (!file || !savedTransaction) return;
    setRetrying(kind);
    try {
      const updated = await DOC_UPLOAD[kind](savedTransaction.id, file);
      setCurrentDocs({
        purchaseOrderKey: updated.purchaseOrderKey,
        invoiceKey: updated.invoiceKey,
        deliveryNoteKey: updated.deliveryNoteKey,
      });
      const remaining = { ...docErrors };
      delete remaining[kind];
      if (Object.keys(remaining).length === 0) {
        // No documents left to retry — finish automatically instead of
        // leaving the user on an empty "problems to finalize" panel.
        onSaved(updated);
        onClose();
        return;
      }
      setSavedTransaction(updated);
      setDocErrors(remaining);
    } catch (e) {
      setDocErrors(prev => ({ ...prev, [kind]: errorMessage(e) }));
    } finally {
      setRetrying(null);
    }
  }

  async function handleViewDoc(kind: DocKind) {
    const id = savedTransaction?.id ?? initial?.id;
    if (!id) return;
    const getUrl = kind === 'purchaseOrder' ? financesApi.getPurchaseOrderUrl
      : kind === 'invoice' ? financesApi.getInvoiceUrl : financesApi.getDeliveryNoteUrl;
    try {
      const { url } = await getUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Impossible d’ouvrir le document.');
    }
  }

  async function handleViewLegacyJustificatif() {
    const id = savedTransaction?.id ?? initial?.id;
    if (!id) return;
    try {
      const { url } = await financesApi.getJustificatifUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Impossible d’ouvrir le justificatif.');
    }
  }

  async function handleRemoveExistingDoc(kind: DocKind) {
    const id = savedTransaction?.id ?? initial?.id;
    if (!id) return;
    const del = kind === 'purchaseOrder' ? financesApi.deletePurchaseOrder
      : kind === 'invoice' ? financesApi.deleteInvoice : financesApi.deleteDeliveryNote;
    try {
      const updated = await del(id);
      setCurrentDocs(prev => ({ ...prev, [DOC_KEY_FIELD[kind]]: null }));
      if (savedTransaction) setSavedTransaction(updated);
    } catch {
      toast.error('Erreur lors de la suppression du document.');
    }
  }

  function finishDespiteErrors() {
    if (savedTransaction) onSaved(savedTransaction);
    onClose();
  }

  function requestClose() {
    // The transaction (if any) is already durably saved at this point —
    // closing just means "stop trying to upload the rest".
    if (savedTransaction) { finishDespiteErrors(); return; }
    onClose();
  }

  const title = isEdit
    ? (type === 'DEPENSE' ? 'Modifier la dépense' : "Modifier l'entrée")
    : (type === 'DEPENSE' ? 'Nouvelle dépense' : 'Nouvelle entrée');

  return (
    // z-50, not z-[60]: this modal embeds the shared ContactAutocomplete
    // (PR 2), whose dropdown popover is z-50 — a higher modal z-index would
    // sit in front of that dropdown and swallow its clicks, since the
    // popover portals to <body> and only wins the stacking order via DOM
    // position when z-index is tied, not when this modal outranks it.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="transaction-modal"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>
            {savedTransaction ? 'Documents à finaliser' : title}
          </h3>
          <button onClick={requestClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        {savedTransaction ? (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 12 }}>
                <AlertTriangle size={14} />
                La {type === 'DEPENSE' ? 'dépense a' : 'entrée a'} été enregistrée, mais {Object.keys(docErrors).length > 1 ? 'certains documents ont' : 'un document a'} échoué.
              </div>
              {(Object.keys(docErrors) as DocKind[]).map(kind => (
                <div key={kind} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg" style={{ border: '1px solid #FECACA', background: '#FEF2F2' }}>
                  <div className="min-w-0">
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>
                      {kind === 'purchaseOrder' ? 'Bon de commande' : kind === 'invoice' ? 'Facture' : 'Bon de livraison'}
                    </p>
                    <p style={{ color: '#B91C1C', fontSize: 11 }}>{docErrors[kind]}</p>
                  </div>
                  <button onClick={() => retryDoc(kind)} disabled={retrying === kind}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    {retrying === kind && <Loader2 size={12} className="animate-spin" />} Réessayer
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={finishDespiteErrors} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Continuer sans ce(s) document(s)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {financialFieldsLocked && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12 }}>
                  <AlertCircle size={14} /> Montant, catégorie et date sont verrouillés : cette dépense a été approuvée.
                </div>
              )}
              <div>
                <label htmlFor="expense-label" style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Libellé *</label>
                <input id="expense-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Fournitures scolaires" style={INPUT} autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="expense-category" style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Catégorie</label>
                  <select id="expense-category" value={category} disabled={financialFieldsLocked}
                    onChange={e => setCategory(e.target.value as ApiTransactionCategory)}
                    style={{ ...INPUT, ...(financialFieldsLocked ? { background: '#F3F4F6', cursor: 'not-allowed' } : {}) }}>
                    {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="expense-date" style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date *</label>
                  <input id="expense-date" type="date" value={date} disabled={financialFieldsLocked}
                    onChange={e => setDate(e.target.value)}
                    style={{ ...INPUT, ...(financialFieldsLocked ? { background: '#F3F4F6', cursor: 'not-allowed' } : {}) }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="expense-amount" style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Montant (FCFA) *</label>
                  <input id="expense-amount" type="number" min={1} value={amount} disabled={financialFieldsLocked}
                    onChange={e => setAmount(e.target.value)} placeholder="45000"
                    style={{ ...INPUT, ...(financialFieldsLocked ? { background: '#F3F4F6', cursor: 'not-allowed' } : {}) }} />
                </div>
                <div>
                  <label htmlFor="expense-status" style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Statut</label>
                  <select id="expense-status" value={status} onChange={e => setStatus(e.target.value as ApiTransactionStatus)} style={INPUT}>
                    <option value="VALIDE">Validé</option>
                    <option value="EN_ATTENTE">En attente</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="expense-payment-method" style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Mode de paiement</label>
                <select id="expense-payment-method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as ApiPaymentMethod | '')} style={INPUT}>
                  <option value="">Non renseigné</option>
                  {paymentMethods.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                </select>
              </div>

              {type === 'DEPENSE' && (
                <ContactAutocomplete
                  label="Fournisseur"
                  placeholder="Rechercher un fournisseur"
                  value={supplierContactId ?? null}
                  selectedContact={supplierContact}
                  onChange={contact => {
                    setSupplierContact(contact);
                    setSupplierContactId(contact?.id ?? null);
                  }}
                  allowCreate
                  includeInactiveSelected={isEdit}
                  categoryKeys={SUPPLIER_CATEGORY_KEYS}
                />
              )}

              {type === 'RECETTE' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#374151' }}>
                    <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
                    Don anonyme
                  </label>
                  {!anonymous && (
                    <input value={donorName} onChange={e => setDonorName(e.target.value)} placeholder="Nom du donateur" style={INPUT} />
                  )}
                </div>
              )}

              {type === 'DEPENSE' ? (
                <>
                  <DocumentPicker label="Bon de commande" existingKey={currentDocs.purchaseOrderKey} file={poFile}
                    onPick={setPoFile}
                    onView={isEdit ? () => handleViewDoc('purchaseOrder') : undefined}
                    onRemoveExisting={isEdit ? () => handleRemoveExistingDoc('purchaseOrder') : undefined} />
                  <DocumentPicker label="Facture" existingKey={currentDocs.invoiceKey} file={invoiceFile}
                    onPick={setInvoiceFile}
                    onView={isEdit ? () => handleViewDoc('invoice') : undefined}
                    onRemoveExisting={isEdit ? () => handleRemoveExistingDoc('invoice') : undefined} />
                  <DocumentPicker label="Bon de livraison — facultatif" existingKey={currentDocs.deliveryNoteKey} file={dnFile}
                    onPick={setDnFile}
                    onView={isEdit ? () => handleViewDoc('deliveryNote') : undefined}
                    onRemoveExisting={isEdit ? () => handleRemoveExistingDoc('deliveryNote') : undefined} />
                  {isEdit && initial?.justifKey && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                      <FileCheck size={14} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <span className="flex-1" style={{ color: '#6B7280', fontSize: 12 }}>Ancien justificatif (hérité)</span>
                      <button type="button" onClick={handleViewLegacyJustificatif}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
                        Voir
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
                    Justificatif (optionnel)
                  </label>
                  <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                    style={{ border: `1px solid ${justifFile ? '#A7F3D0' : '#E5E7EB'}`, background: justifFile ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
                    <Upload size={14} style={{ color: justifFile ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: justifFile ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {justifFile ? justifFile.name : (isEdit && initial?.justifKey ? 'Document en ligne — remplacer…' : 'Joindre un fichier…')}
                    </span>
                    {justifFile && (
                      <button type="button" onClick={e => { e.preventDefault(); setJustifFile(null); }}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    )}
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setJustifFile(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              {apiError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }}>
                  <AlertCircle size={14} /> {apiError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={requestClose} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
              <button disabled={!canSave || saving} onClick={handleSave}
                className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
                style={{ background: canSave && !saving ? '#3E5A78' : '#E5E7EB', color: canSave && !saving ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Enregistrer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Budget editor modal ────────────────────────────────────────────────────────

function BudgetEditorModal({ initial, onSave, onClose }: {
  initial: Record<string, number>;
  onSave: (values: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, initial[c] ? String(initial[c]) : ''])),
  );

  const handleSave = () => {
    const parsed: Record<string, number> = {};
    for (const c of EXPENSE_CATEGORIES) {
      const n = parseInt(values[c], 10);
      if (n > 0) parsed[c] = n;
    }
    onSave(parsed);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Budget prévisionnel du mois</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
          {EXPENSE_CATEGORIES.map(c => (
            <div key={c}>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>{CATEGORY_LABELS[c]}</label>
              <input type="number" min={0} value={values[c]}
                onChange={e => setValues(v => ({ ...v, [c]: e.target.value }))}
                placeholder="0" style={INPUT} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export function FinancesPage() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';

  const now = new Date();
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDepense, setShowAddDepense] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiTransaction | null>(null);
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);
  // PR 5E — expense approval workflow.
  const [decision, setDecision] = useState<{ action: ExpenseAction; transaction: ApiTransaction } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ApiTransaction | null>(null);
  // Budget/reserved/consumed/available is scoped to one category + one
  // *transaction* month — the page-level `dashboard` above is always the
  // current calendar month, which is the wrong period for any expense dated
  // in a different month (a backdated entry, or simply last month's pending
  // request still awaiting a decision). Cached per "year-month" key so each
  // distinct period is only ever fetched once.
  const [budgetCache, setBudgetCache] = useState<Map<string, ApiDashboardCategory[]>>(new Map());

  const reload = () => Promise.all([
    financesApi.getDashboard(now.getFullYear(), now.getMonth() + 1),
    financesApi.listTransactions(),
  ]).then(([d, t]) => {
    setDashboard(d);
    setTransactions(t);
    setBudgetCache(prev => new Map(prev).set(`${now.getFullYear()}-${now.getMonth() + 1}`, d.byCategory));
  });

  useEffect(() => {
    // PR 6 — idempotent: only creates whatever default categories are still
    // missing for the current month, never overwrites a custom amount. Runs
    // before the first dashboard load so the seeded lines are visible
    // immediately, with no visible "empty budget" flash on a first visit.
    financesApi.ensureDefaultBudgetLines()
      .catch(() => {})
      .then(() => reload())
      .catch(() => toast.error('Erreur de chargement des finances.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const periods = new Set(
      transactions
        .filter(t => t.type === 'DEPENSE')
        .map(t => {
          const d = new Date(t.date);
          return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
        }),
    );
    for (const key of periods) {
      if (budgetCache.has(key)) continue;
      const [year, month] = key.split('-').map(Number);
      financesApi.getDashboard(year, month)
        .then(d => setBudgetCache(prev => new Map(prev).set(key, d.byCategory)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  const budgetCategoryFor = (t: ApiTransaction): ApiDashboardCategory | undefined => {
    const d = new Date(t.date);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    return budgetCache.get(key)?.find(c => c.category === t.category);
  };

  // TransactionModal now owns its own create/update + document-upload calls
  // (see its docstring) — the parent's job is just to refresh the list and
  // close whichever modal was open.
  const handleSaved = async (transaction: ApiTransaction) => {
    await reload();
    setShowAddDepense(false);
    setEditTarget(null);
    toast.success(transaction.type === 'DEPENSE' ? 'Dépense enregistrée.' : 'Entrée enregistrée.');
  };

  const handleDelete = async (id: string) => {
    try {
      await financesApi.deleteTransaction(id);
      await reload();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  // ─── Expense approval workflow (PR 5E) ─────────────────────────────────

  const DECISION_SUCCESS_MESSAGE: Record<ExpenseAction, string> = {
    submit: 'Dépense soumise pour validation.',
    resubmit: 'Dépense resoumise pour validation.',
    approve: 'Dépense approuvée.',
    reject: 'Dépense refusée.',
  };

  const handleDecisionDone = async (action: ExpenseAction) => {
    await reload();
    setDecision(null);
    toast.success(DECISION_SUCCESS_MESSAGE[action]);
  };

  const handleComplete = async (t: ApiTransaction) => {
    if (!t.invoiceKey) {
      toast.error('Une facture est requise avant de clôturer cette dépense.');
      return;
    }
    if (!window.confirm(`Clôturer la dépense « ${t.label} » ? Le montant réservé devient consommé.`)) return;
    try {
      await financesApi.completeExpense(t.id);
      await reload();
      toast.success('Dépense clôturée.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const handleCancel = async (t: ApiTransaction) => {
    if (!window.confirm(`Annuler la dépense approuvée « ${t.label} » ? Cette action est définitive.`)) return;
    try {
      await financesApi.cancelExpense(t.id);
      await reload();
      toast.success('Dépense annulée.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const handleViewJustificatif = async (id: string) => {
    try {
      const { url } = await financesApi.getJustificatifUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le justificatif.");
    }
  };

  const handleViewTransactionDoc = async (id: string, kind: 'purchaseOrder' | 'invoice' | 'deliveryNote') => {
    const getUrl = kind === 'purchaseOrder' ? financesApi.getPurchaseOrderUrl
      : kind === 'invoice' ? financesApi.getInvoiceUrl : financesApi.getDeliveryNoteUrl;
    try {
      const { url } = await getUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleSaveBudget = async (values: Record<string, number>) => {
    try {
      await Promise.all(
        Object.entries(values).map(([category, budgetXof]) =>
          financesApi.upsertBudgetLine({
            category: category as ApiTransactionCategory,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            budgetXof,
          }),
        ),
      );
      await reload();
      setShowBudgetEditor(false);
      toast.success('Budget mis à jour.');
    } catch {
      toast.error('Erreur lors de la mise à jour du budget.');
    }
  };

  if (loading || !dashboard) {
    return (
      <div className="flex items-center justify-center" style={{ height: '60vh' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#3E5A78' }} />
      </div>
    );
  }

  const totalBudget = dashboard.byCategory.reduce((s, c) => s + (c.budgetXof ?? 0), 0);
  const totalRealized = dashboard.byCategory.reduce((s, c) => s + c.realizedXof, 0);
  const totalRestant = totalBudget - totalRealized;

  const budgetInitial = Object.fromEntries(
    dashboard.byCategory.filter(c => c.budgetXof !== null).map(c => [c.category, c.budgetXof as number]),
  );

  return (
    <div className="px-4 md:px-6 py-6 space-y-6" style={{ maxWidth: 1200 }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Finances & Budget</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {MONTH_LABELS[dashboard.period.month - 1]} {dashboard.period.year}
          </p>
        </div>
        {isDirector && (
          <div className="flex gap-2">
            {/* "Entrée"/Recette creation is hidden per product decision — DEPENSE
                is the only entry point from this page now. RECETTE stays fully
                supported everywhere else (Prisma, API, types, historical rows,
                and the edit modal below via `editTarget`). */}
            <button onClick={() => setShowAddDepense(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg"
              style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              <Plus size={14} /> Dépense
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
      {dashboard.alerts.length > 0 && (
        <div className="space-y-2">
          {dashboard.alerts.map(a => (
            <div key={a.category} className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertCircle size={15} style={{ color: '#B91C1C', flexShrink: 0 }} />
              <p style={{ color: '#1A1A1A', fontSize: 13 }}>
                <strong>{CATEGORY_LABELS[a.category]}</strong> — dépassement de budget : {formatXof(a.realizedXof)} / {formatXof(a.budgetXof)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* "Demandes à valider" (expenses) — SUPERVISOR decides, DIRECTOR sees
          status. Shared component — see its own docstring; not reimplemented
          here. */}
      <PendingExpenseApprovals />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Solde caisse',    value: formatXof(dashboard.soldeCaisseXof), sub: formatEur(dashboard.soldeCaisseEur), color: '#065F46', bg: '#ECFDF5', icon: TrendingUp },
          { label: 'Dépenses du mois', value: formatXof(totalRealized), sub: `${totalBudget > 0 ? Math.round(totalRealized / totalBudget * 100) : 0}% du budget`, color: '#D97706', bg: '#FFFBEB', icon: TrendingDown },
          { label: 'Budget restant',   value: formatXof(totalRestant), sub: `Budget total ${formatXof(totalBudget)}`, color: '#3E5A78', bg: '#EEF2F7', icon: TrendingUp },
        ].map(({ label, value, sub, color, bg, icon: Icon }) => (
          <div key={label} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>{value}</p>
            <p style={{ color: '#374151', fontSize: 13, fontWeight: 500, marginTop: 3 }}>{label}</p>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Dépenses par catégorie</h3>
          <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Mois en cours</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashboard.byCategory.map(c => ({ ...c, label: CATEGORY_LABELS[c.category] }))}
              layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="realizedXof" name="Dépensé" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
                {dashboard.byCategory.map(c => <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Comparatif mensuel</h3>
          <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Recettes vs dépenses — 6 derniers mois</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashboard.monthlyTrend.map(m => ({ ...m, label: MONTH_LABELS[m.month - 1] }))}
              margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="recettesXof" name="Recettes" fill="#065F46" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
              <Bar dataKey="depensesXof" name="Dépenses" fill="#B91C1C" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Budget prévisionnel */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Budget prévisionnel</h3>
          <button onClick={() => setShowBudgetEditor(true)}
            className="px-3 py-1.5 rounded-lg" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Éditer le budget
          </button>
        </div>
        <div className="p-5 space-y-4">
          {dashboard.byCategory.filter(c => c.budgetXof !== null).map(c => {
            // PR 6: reserved/consumed/available/totalCommittedPercentage have
            // existed on the dashboard response since PR 5C but were never
            // surfaced here — this replaces the old realized-only bar (which
            // also divided by zero whenever budgetXof was 0, e.g. the
            // Salaires default) with the full picture, null-safe throughout.
            const pct = c.totalCommittedPercentage; // null when budgetXof is 0 or absent
            const barPct = pct === null ? 0 : Math.min(pct, 100);
            const overBudget = c.committedOverBudget;
            return (
              <div key={c.category} data-testid={`budget-row-${c.category}`}>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c.category] }} />
                    <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{CATEGORY_LABELS[c.category]}</span>
                  </div>
                  <span style={{ color: overBudget ? '#B91C1C' : '#065F46', fontSize: 12, fontWeight: 700 }}>
                    {pct === null ? '—' : `${pct}%`} <span style={{ color: '#9CA3AF', fontWeight: 500 }}>engagé</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 mb-1.5">
                  <span style={{ color: '#9CA3AF', fontSize: 11.5 }}>Budget : <strong style={{ color: '#374151' }}>{formatXof(c.budgetXof as number)}</strong></span>
                  <span style={{ color: '#9CA3AF', fontSize: 11.5 }}>Réservé : <strong style={{ color: '#374151' }}>{formatXof(c.reservedXof)}</strong></span>
                  <span style={{ color: '#9CA3AF', fontSize: 11.5 }}>Consommé : <strong style={{ color: '#374151' }}>{formatXof(c.consumedXof)}</strong></span>
                  <span style={{ color: '#9CA3AF', fontSize: 11.5 }}>Disponible : <strong style={{ color: (c.availableXof ?? 0) < 0 ? '#B91C1C' : '#065F46' }}>{formatXof(c.availableXof ?? 0)}</strong></span>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
                  <div className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style={{ width: `${barPct}%`, background: overBudget ? '#B91C1C' : barPct >= 75 ? '#D97706' : CATEGORY_COLORS[c.category] }} />
                </div>
              </div>
            );
          })}
          {dashboard.byCategory.filter(c => c.budgetXof !== null).length === 0 && (
            <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
              Aucun budget défini pour ce mois. Cliquez sur « Éditer le budget » pour commencer.
            </p>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Transactions</h3>
        </div>
        {transactions.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucune transaction enregistrée.</p>
        ) : (
          <ul>
            {transactions.map((t, i) => {
              const status = STATUS_STYLE[t.status];
              const supplierInactive = t.type === 'DEPENSE' && !!t.supplierContact && !t.supplierContact.active;
              const workflow = t.expenseWorkflowStatus;
              const workflowStyle = workflow ? EXPENSE_WORKFLOW_STATUS_STYLE[workflow] : null;
              const readOnly = !!workflow && READ_ONLY_STATES.includes(workflow);
              // Director-only workflow actions, gated by current state (see PR 5E scope).
              const canEditDelete = isDirector && !readOnly;
              return (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50"
                  style={{ borderBottom: i < transactions.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
                  <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: 32, height: 32, background: t.type === 'RECETTE' ? '#ECFDF5' : '#FEF2F2' }}>
                    {t.type === 'RECETTE'
                      ? <ArrowDownRight size={14} style={{ color: '#065F46' }} />
                      : <ArrowUpRight size={14} style={{ color: '#B91C1C' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{t.label}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>
                      {CATEGORY_LABELS[t.category]} · {new Date(t.date).toLocaleDateString('fr-FR')}
                      {t.donorName ? ` · ${t.donorName}` : t.isAnonymousDonor ? ' · Donateur anonyme' : ''}
                      {t.type === 'DEPENSE' && (
                        <>
                          {' · '}{t.supplierContact?.fullName ?? 'Fournisseur non renseigné'}
                          {t.supplierContact?.organization ? ` (${t.supplierContact.organization})` : ''}
                          {supplierInactive ? ' (inactif)' : ''}
                        </>
                      )}
                      {t.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[t.paymentMethod]}`}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: status.bg, color: status.color, fontSize: 10, fontWeight: 600 }}>
                    {STATUS_LABELS[t.status].toUpperCase()}
                  </span>
                  {workflow && workflowStyle && (
                    <span className="px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: workflowStyle.bg, color: workflowStyle.color, fontSize: 10, fontWeight: 700 }}>
                      {EXPENSE_WORKFLOW_STATUS_LABELS[workflow].toUpperCase()}
                    </span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {t.justifKey && (
                      <button onClick={() => handleViewJustificatif(t.id)} title="Voir le justificatif (hérité)"
                        className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: 'none', color: '#6B7280', border: 'none', cursor: 'pointer' }}>
                        <Eye size={13} />
                      </button>
                    )}
                    {t.purchaseOrderKey && (
                      <button onClick={() => handleViewTransactionDoc(t.id, 'purchaseOrder')} title="Bon de commande"
                        className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: 'none', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                        <FileCheck size={13} />
                      </button>
                    )}
                    {t.invoiceKey && (
                      <button onClick={() => handleViewTransactionDoc(t.id, 'invoice')} title="Facture"
                        className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: 'none', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                        <FileCheck size={13} />
                      </button>
                    )}
                    {t.deliveryNoteKey && (
                      <button onClick={() => handleViewTransactionDoc(t.id, 'deliveryNote')} title="Bon de livraison"
                        className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: 'none', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                        <FileCheck size={13} />
                      </button>
                    )}
                  </div>
                  <span style={{ color: t.type === 'RECETTE' ? '#065F46' : '#B91C1C', fontSize: 14, fontWeight: 700, flexShrink: 0, minWidth: 100, textAlign: 'right' }}>
                    {t.type === 'RECETTE' ? '+' : '-'}{formatXof(t.amountXof)}
                  </span>

                  {/* PR 5E — expense workflow actions, DIRECTOR-only, gated by state */}
                  {workflow && (
                    <button onClick={() => setHistoryTarget(t)} title="Historique de validation" className="flex-shrink-0"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                      <History size={14} />
                    </button>
                  )}
                  {isDirector && workflow === null && t.type === 'DEPENSE' && (
                    <button onClick={() => setDecision({ action: 'submit', transaction: t })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg flex-shrink-0"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 11.5, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Send size={12} /> Soumettre
                    </button>
                  )}
                  {isDirector && workflow === 'REJECTED' && (
                    <button onClick={() => setDecision({ action: 'resubmit', transaction: t })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg flex-shrink-0"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 11.5, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Send size={12} /> Resoumettre
                    </button>
                  )}
                  {isDirector && workflow === 'APPROVED' && (
                    <>
                      <button onClick={() => handleComplete(t)} title={t.invoiceKey ? undefined : 'Une facture est requise avant de clôturer cette dépense.'}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: '#065F46', color: '#FFFFFF', fontSize: 11.5, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: t.invoiceKey ? 1 : 0.5 }}>
                        <CheckCircle2 size={12} /> Clôturer
                      </button>
                      <button onClick={() => handleCancel(t)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}>
                        {/* "Abandonner", not "Annuler [la dépense]" — Playwright's
                            getByRole name matching is substring+case-insensitive, and
                            both "Annuler" (every modal's own cancel button) and "Dépense"
                            (the header create button) are pre-existing page-global
                            selectors elsewhere in this codebase's e2e suite; this label
                            must share no substring with either. */}
                        <Ban size={12} /> Abandonner
                      </button>
                    </>
                  )}

                  {canEditDelete && (
                    <>
                      <button onClick={() => setEditTarget(t)} title="Modifier" className="flex-shrink-0"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} title="Supprimer" className="flex-shrink-0"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAddDepense && (
        <TransactionModal type="DEPENSE" onClose={() => setShowAddDepense(false)} onSaved={handleSaved} />
      )}
      {editTarget && (
        <TransactionModal type={editTarget.type} initial={editTarget} onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      )}
      {showBudgetEditor && (
        <BudgetEditorModal initial={budgetInitial} onClose={() => setShowBudgetEditor(false)} onSave={handleSaveBudget} />
      )}
      {decision && (
        <ExpenseDecisionModal
          action={decision.action}
          transaction={decision.transaction}
          budgetCategory={budgetCategoryFor(decision.transaction)}
          onDone={() => handleDecisionDone(decision.action)}
          onClose={() => setDecision(null)}
        />
      )}
      {historyTarget && (
        <ValidationHistoryModal
          resourceType="EXPENSE_TRANSACTION"
          resourceId={historyTarget.id}
          title={historyTarget.label}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
