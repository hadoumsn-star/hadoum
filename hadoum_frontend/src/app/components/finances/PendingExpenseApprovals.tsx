import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { financesApi, type ApiTransaction, type ApiDashboardCategory } from '../../services/finances.api';
import { CATEGORY_LABELS, formatXof } from '../../config/financeCategories.config';
import { useAuth } from '../../context/AuthContext';
import { ExpenseBudgetSummary, ExpenseDecisionModal, type ExpenseAction } from './ExpenseDecisionModal';

// Shared "Demandes à valider" (expenses) widget — originally "Dépenses à
// valider"; renamed for consistency with the rest of the Supervisor
// validation interface, since the title is generic even though this
// particular widget only ever lists expenses (see
// PendingValidationsList.tsx for the multi-resource-type unified list that
// covers everything else, including expenses too, on the Supervisor
// Dashboard and /app/validations). Still the exact same pending-expense-
// approval section previously inlined in FinancesPage; FinancesPage is now
// its only consumer — same title, cards, layout, badges, budget summary,
// Approuver/Refuser buttons, and decision modal there as always.
//
// Self-contained on purpose: fetches its own transactions + per-period
// budget cache and owns its own approve/reject decision modal, so it can be
// dropped into any page without prop-drilling that page's own finance
// state (FinancesPage's `transactions`/`budgetCache`/`decision` still exist
// there too, but only for the full transaction list and the
// submit/resubmit flow — a separate concern this widget never touches).
//
// Empty/loading behavior matches this section's prior life inline in
// FinancesPage exactly: it has never had a distinct empty-state or
// loading-state visual of its own — while loading, or when there is no
// pending expense, it renders nothing at all.
export function PendingExpenseApprovals() {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor';

  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  // Budget/reserved/consumed/available is scoped to one category + one
  // *transaction* month — cached per "year-month" key so each distinct
  // period among the pending expenses is only ever fetched once (same
  // reasoning as FinancesPage's own page-level cache, kept separate here).
  const [budgetCache, setBudgetCache] = useState<Map<string, ApiDashboardCategory[]>>(new Map());
  const [decision, setDecision] = useState<{ action: ExpenseAction; transaction: ApiTransaction } | null>(null);

  const reload = () => financesApi.listTransactions().then(setTransactions);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const pending = transactions.filter(t => t.expenseWorkflowStatus === 'PENDING_APPROVAL');

  useEffect(() => {
    const periods = new Set(
      pending.map(t => {
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

  const DECISION_SUCCESS_MESSAGE: Partial<Record<ExpenseAction, string>> = {
    approve: 'Dépense approuvée.',
    reject: 'Dépense refusée.',
  };

  const handleDecisionDone = async (action: ExpenseAction) => {
    await reload();
    setDecision(null);
    const message = DECISION_SUCCESS_MESSAGE[action];
    if (message) toast.success(message);
  };

  if (loading || pending.length === 0) return null;

  return (
    <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #FDE68A' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Demandes à valider</h3>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>{pending.length} en attente de décision</p>
      </div>
      <ul>
        {pending.map((t, i) => {
          const budgetCategory = budgetCategoryFor(t);
          return (
            <li key={t.id} className="px-5 py-4" style={{ borderBottom: i < pending.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{t.label}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>
                    {CATEGORY_LABELS[t.category]} · {formatXof(t.amountXof)} · {new Date(t.date).toLocaleDateString('fr-FR')}
                    {t.supplierContact ? ` · ${t.supplierContact.fullName}` : ''}
                  </p>
                </div>
                {isSupervisor && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setDecision({ action: 'approve', transaction: t })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ background: '#065F46', color: '#FFFFFF', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <ShieldCheck size={13} /> Approuver
                    </button>
                    <button onClick={() => setDecision({ action: 'reject', transaction: t })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                      <ShieldAlert size={13} /> Refuser
                    </button>
                  </div>
                )}
              </div>
              {budgetCategory && (
                <div className="mt-3">
                  <ExpenseBudgetSummary category={budgetCategory} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {decision && (
        <ExpenseDecisionModal
          action={decision.action}
          transaction={decision.transaction}
          budgetCategory={budgetCategoryFor(decision.transaction)}
          onDone={() => handleDecisionDone(decision.action)}
          onClose={() => setDecision(null)}
        />
      )}
    </div>
  );
}
