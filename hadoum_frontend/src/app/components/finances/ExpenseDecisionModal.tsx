import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import {
  financesApi, InsufficientBudgetError, NoBudgetLineError,
  type ApiTransaction, type ApiDashboardCategory,
} from '../../services/finances.api';
import { validationsApi } from '../../services/validations.api';
import type { ApiValidationRequest } from '../../services/maintenanceTickets.api';
import { CATEGORY_LABELS, formatXof, type ApiTransactionCategory } from '../../config/financeCategories.config';
import { VALIDATION_STATUS_LABELS, VALIDATION_STATUS_STYLE } from '../../config/validations.config';

// Deliberately narrower than the full ApiTransaction — this modal only ever
// reads these five fields, and ValidationsPage (PR 5F) only has a partial
// resource shape (from GET /validations/pending) to give it, not a full
// Transaction. A real ApiTransaction satisfies this structurally, so
// FinancesPage's existing callers pass one unchanged.
export interface ExpenseDecisionSubject {
  id: string;
  label: string;
  category: ApiTransactionCategory;
  amountXof: number;
  supplierContact?: { fullName: string } | null;
}

// PR 5E/5F: shared between FinancesPage (Director) and ValidationsPage
// (Supervisor) so the two pages never re-implement the same decision UI or
// error rendering — one place that knows how to call submit/resubmit/
// approve/reject and how to render an InsufficientBudgetError, used from
// both.

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Budget summary block ───────────────────────────────────────────────────

export function ExpenseBudgetSummary({ category }: { category: ApiDashboardCategory }) {
  return (
    <div className="rounded-lg px-3 py-2.5 space-y-1.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
      <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, letterSpacing: '0.03em' }}>
        BUDGET {CATEGORY_LABELS[category.category].toUpperCase()}
      </p>
      {category.budgetXof === null ? (
        <p style={{ color: '#D97706', fontSize: 12 }}>Aucun budget défini pour cette catégorie et cette période.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <p style={{ color: '#374151', fontSize: 12 }}>Budget : <strong>{formatXof(category.budgetXof)}</strong></p>
          <p style={{ color: '#374151', fontSize: 12 }}>Disponible : <strong style={{ color: (category.availableXof ?? 0) < 0 ? '#B91C1C' : '#065F46' }}>{formatXof(category.availableXof ?? 0)}</strong></p>
          <p style={{ color: '#374151', fontSize: 12 }}>Réservé : {formatXof(category.reservedXof)}</p>
          <p style={{ color: '#374151', fontSize: 12 }}>Consommé : {formatXof(category.consumedXof)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Submit / resubmit / approve / reject decision modal ───────────────────

export type ExpenseAction = 'submit' | 'resubmit' | 'approve' | 'reject';

const EXPENSE_DECISION_CFG: Record<ExpenseAction, {
  title: string; commentRequired: boolean; commentLabel: string; confirmLabel: string; confirmColor: string;
}> = {
  submit:   { title: 'Soumettre la dépense',   commentRequired: false, commentLabel: 'Commentaire (optionnel)', confirmLabel: 'Soumettre',   confirmColor: '#3E5A78' },
  resubmit: { title: 'Resoumettre la dépense', commentRequired: false, commentLabel: 'Commentaire (optionnel)', confirmLabel: 'Resoumettre', confirmColor: '#3E5A78' },
  approve:  { title: 'Approuver la dépense',   commentRequired: false, commentLabel: 'Commentaire (optionnel)', confirmLabel: 'Approuver',   confirmColor: '#065F46' },
  reject:   { title: 'Refuser la dépense',     commentRequired: true,  commentLabel: 'Motif du refus *',        confirmLabel: 'Refuser',     confirmColor: '#B91C1C' },
};

export function ExpenseDecisionModal({ action, transaction, budgetCategory, onDone, onClose }: {
  action: ExpenseAction;
  transaction: ExpenseDecisionSubject;
  budgetCategory?: ApiDashboardCategory;
  onDone: (updated: ApiTransaction) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<InsufficientBudgetError | null>(null);
  const cfg = EXPENSE_DECISION_CFG[action];
  const canConfirm = !cfg.commentRequired || comment.trim().length > 0;
  // Shown for submit/resubmit (visibility before committing) and approve
  // (the supervisor's own availability check, before the backend enforces it).
  const showBudgetSummary = action !== 'reject' && !!budgetCategory;

  async function handleConfirm() {
    if (!canConfirm || saving) return;
    setSaving(true);
    setApiError(null);
    setBudgetError(null);
    try {
      const c = comment.trim() || undefined;
      let updated: ApiTransaction;
      if (action === 'submit') updated = await financesApi.submitExpense(transaction.id, c);
      else if (action === 'resubmit') updated = await financesApi.resubmitExpense(transaction.id, c);
      else if (action === 'approve') updated = await financesApi.approveExpense(transaction.id, c);
      else updated = await financesApi.rejectExpense(transaction.id, comment.trim());
      onDone(updated);
    } catch (e) {
      if (e instanceof InsufficientBudgetError) setBudgetError(e);
      else if (e instanceof NoBudgetLineError) setApiError(e.message);
      else setApiError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="expense-decision-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{cfg.title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{transaction.label}</p>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>
              {CATEGORY_LABELS[transaction.category]} · {formatXof(transaction.amountXof)}
              {transaction.supplierContact ? ` · ${transaction.supplierContact.fullName}` : ''}
            </p>
          </div>
          {showBudgetSummary && budgetCategory && <ExpenseBudgetSummary category={budgetCategory} />}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              {cfg.commentLabel}
            </label>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              rows={3} placeholder="Expliquez votre décision…" style={{ ...INPUT, resize: 'none' }} autoFocus />
          </div>
          {budgetError && (
            <div className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="flex items-center gap-1.5" style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>
                <AlertCircle size={13} /> Budget disponible insuffisant
              </p>
              <div className="grid grid-cols-2 gap-x-3" style={{ color: '#7F1D1D', fontSize: 11.5 }}>
                <p>Budget : {formatXof(budgetError.budgetXof)}</p>
                <p>Demandé : {formatXof(budgetError.requestedXof)}</p>
                <p>Réservé : {formatXof(budgetError.reservedXof)}</p>
                <p>Consommé : {formatXof(budgetError.consumedXof)}</p>
                <p className="col-span-2">Disponible : <strong>{formatXof(budgetError.availableXof)}</strong></p>
              </div>
            </div>
          )}
          {apiError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }}>
              <AlertCircle size={14} /> {apiError}
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            disabled={!canConfirm || saving}
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{
              background: canConfirm && !saving ? cfg.confirmColor : '#E5E7EB',
              color: canConfirm && !saving ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canConfirm && !saving ? 'pointer' : 'not-allowed',
            }}>
            {saving && <Loader2 size={13} className="animate-spin" />} {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation history modal (generic — any resource type) ────────────────
//
// PR 5F: reused by ValidationsPage for every resource type via the generic
// GET /validations/:resourceType/:resourceId/history endpoint, not just
// expenses — resourceType/resourceId/title are the only required inputs.

export function ValidationHistoryModal({ resourceType, resourceId, title, subtitle, onClose }: {
  resourceType: string;
  resourceId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<ApiValidationRequest[] | null>(null);

  useEffect(() => {
    validationsApi.history(resourceType, resourceId)
      .then(setHistory)
      .catch(() => toast.error("Erreur lors du chargement de l'historique."));
  }, [resourceType, resourceId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="validation-history-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div>
            <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Historique de validation</h3>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{title}{subtitle ? ` — ${subtitle}` : ''}</p>
          </div>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {history === null ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
          ) : history.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun historique de validation.</p>
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
      </div>
    </div>
  );
}
