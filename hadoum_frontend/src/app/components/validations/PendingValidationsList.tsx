import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import {
  ShieldCheck, ShieldAlert, History, Loader2, ChevronRight, CheckCircle2, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { validationsApi, type ApiPendingValidation, type ApiPendingValidationResource } from '../../services/validations.api';
import { financesApi, type ApiDashboardCategory } from '../../services/finances.api';
import { supplierContractsApi } from '../../services/supplierContracts.api';
import { administrativeProceduresApi } from '../../services/administrativeProcedures.api';
import { maintenanceTicketsApi } from '../../services/maintenanceTickets.api';
import { stockItemsApi } from '../../services/stockItems.api';
import { inventoryAssetsApi } from '../../services/inventoryAssets.api';
import { entryLogsApi } from '../../services/entryLogs.api';
import { goodsMovementLogsApi } from '../../services/goodsMovementLogs.api';
import {
  CATEGORY_LABELS, formatXof,
  EXPENSE_WORKFLOW_STATUS_LABELS, EXPENSE_WORKFLOW_STATUS_STYLE,
  type ApiTransactionCategory,
} from '../../config/financeCategories.config';
import { TICKET_URGENCY_LABELS } from '../../config/maintenanceTickets.config';
import { PROCEDURE_STATUS_LABELS } from '../../config/administrativeProcedures.config';
import {
  ExpenseBudgetSummary, ExpenseDecisionModal, ValidationHistoryModal, type ExpenseAction,
} from '../finances/ExpenseDecisionModal';

// ─── Generic "one unified Demandes à valider experience" (Supervisor
// validation consistency) ───────────────────────────────────────────────────
//
// Single implementation of the pending-ValidationRequest list, adaptive per
// resourceType, used both by the full-page /app/validations (ValidationsPage)
// and the "Demandes à valider" section of the Supervisor Dashboard — one
// component, not a second lookalike list. Always reads the same generic
// GET /validations/pending endpoint every resource type already shares; the
// only thing that differs per card is which fields get pulled out of
// `item.resource` for display, and which existing per-resource approve/
// reject endpoint a decision dispatches to (never a new backend endpoint —
// every one of these already exists and is exercised on that resource's own
// dedicated page).
//
// EXPENSE_TRANSACTION keeps its own distinct path (ExpenseDecisionModal +
// financesApi, with the budget summary) — the exact same component/flow
// FinancesPage and PendingExpenseApprovals already use, not reimplemented.
// Every other resource type with a wired {approve, reject} API (contracts,
// procedures, tickets, stock items, inventory assets, entry logs, goods
// movements) goes through one small GenericDecisionModal instead — the same
// title/comment/confirm shape every one of those resources' own page
// already has its own local copy of, not a further duplicate of any one of
// them specifically. A handful of resource types (activities, leave
// requests, fund requests) have no wired frontend approve/reject endpoint
// at all yet, so they still display (adaptively falling back to a generic
// description) but show no decision buttons, rather than pointing at
// something that doesn't exist.

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  MAINTENANCE_TICKET: 'Ticket de maintenance',
  SUPPLIER_CONTRACT: 'Contrat fournisseur',
  ADMINISTRATIVE_PROCEDURE: 'Démarche administrative',
  STOCK_ITEM: 'Article de stock',
  INVENTORY_ASSET: 'Bien inventorié',
  ENTRY_LOG: "Registre d'entrée/sortie",
  GOODS_MOVEMENT_LOG: 'Mouvement de biens',
  ACTIVITY: 'Activité pédagogique',
  LEAVE_REQUEST: 'Demande de congé',
  FUND_REQUEST: 'Demande de fonds',
  EXPENSE_TRANSACTION: 'Dépense',
};

export const RESOURCE_TYPE_LINKS: Record<string, string> = {
  MAINTENANCE_TICKET: '/app/tickets-maintenance',
  SUPPLIER_CONTRACT: '/app/contrats-fournisseurs',
  ADMINISTRATIVE_PROCEDURE: '/app/demarches-administratives',
  STOCK_ITEM: '/app/stocks-inventaire',
  INVENTORY_ASSET: '/app/stocks-inventaire',
  ENTRY_LOG: '/app/registre-entrees-sorties',
  GOODS_MOVEMENT_LOG: '/app/registre-entrees-sorties',
  EXPENSE_TRANSACTION: '/app/finances',
};

function describeGenericResource(item: ApiPendingValidation): string {
  const r = item.resource;
  if (!r) return 'Ressource introuvable (peut-être supprimée)';
  return (
    r.title ?? r.contractName ?? r.name ?? r.fullName ?? r.description
    ?? `#${item.resourceId.slice(0, 8)}`
  );
}

// Shared by MAINTENANCE_TICKET and ADMINISTRATIVE_PROCEDURE — prefer the
// linked Contact over the legacy free-text field, never show both; "Aucun
// responsable" when neither is set (requirement: display fields for
// Administrative Procedures).
function responsibleLabel(r: ApiPendingValidationResource | null | undefined): string {
  if (!r) return 'Aucun responsable';
  return r.assignedContact?.fullName ?? r.assignedTo ?? 'Aucun responsable';
}

type GenericAction = 'approve' | 'reject';

interface GenericDecider {
  approve: (id: string, comment?: string) => Promise<unknown>;
  reject: (id: string, comment: string) => Promise<unknown>;
}

// Every one of these functions already exists and is already exercised on
// its own resource's dedicated page (SupplierContractsPage,
// DemarchesAdministrativesPage, TicketsMaintenancePage,
// StocksInventairePage, RegistreEntreesSortiesPage) — reused here as-is.
const GENERIC_DECIDERS: Partial<Record<string, GenericDecider>> = {
  SUPPLIER_CONTRACT: { approve: supplierContractsApi.approve, reject: supplierContractsApi.reject },
  ADMINISTRATIVE_PROCEDURE: { approve: administrativeProceduresApi.approve, reject: administrativeProceduresApi.reject },
  MAINTENANCE_TICKET: { approve: maintenanceTicketsApi.approve, reject: maintenanceTicketsApi.reject },
  STOCK_ITEM: { approve: stockItemsApi.approve, reject: stockItemsApi.reject },
  INVENTORY_ASSET: { approve: inventoryAssetsApi.approve, reject: inventoryAssetsApi.reject },
  ENTRY_LOG: { approve: entryLogsApi.approve, reject: entryLogsApi.reject },
  GOODS_MOVEMENT_LOG: { approve: goodsMovementLogsApi.approve, reject: goodsMovementLogsApi.reject },
};

const GENERIC_DECISION_CFG: Record<GenericAction, { title: string; commentRequired: boolean; confirmLabel: string; confirmColor: string }> = {
  approve: { title: 'Approuver la demande', commentRequired: false, confirmLabel: 'Approuver', confirmColor: '#065F46' },
  reject:  { title: 'Refuser la demande',   commentRequired: true,  confirmLabel: 'Refuser',   confirmColor: '#B91C1C' },
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// Same title/comment/confirm shape every resource-specific page already has
// its own local copy of (SupplierContractsPage's ValidationDecisionModal,
// etc.) — not a further duplicate of any *one* of them, just this
// component's own instance of the same established pattern, since reject
// requires a comment here exactly as it already does on every one of those
// pages.
function GenericDecisionModal({ action, onConfirm, onClose }: {
  action: GenericAction;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const cfg = GENERIC_DECISION_CFG[action];
  const canConfirm = !cfg.commentRequired || comment.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="generic-decision-modal"
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

export function PendingValidationsList({ variant }: { variant: 'page' | 'card' }) {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor';

  const [pending, setPending] = useState<ApiPendingValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseDecision, setExpenseDecision] = useState<{ action: ExpenseAction; item: ApiPendingValidation } | null>(null);
  const [genericDecision, setGenericDecision] = useState<{ action: GenericAction; item: ApiPendingValidation } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ApiPendingValidation | null>(null);
  // Budget/reserved/consumed/available is scoped to one category + one
  // *expense's own* month — fetched on demand per distinct period seen in
  // the pending list, same reasoning as FinancesPage/PendingExpenseApprovals.
  const [budgetCache, setBudgetCache] = useState<Map<string, ApiDashboardCategory[]>>(new Map());

  const load = () =>
    validationsApi.pending()
      .then(setPending)
      .catch(() => toast.error('Erreur lors du chargement des demandes en attente.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const periods = new Set(
      pending
        .filter(p => p.resourceType === 'EXPENSE_TRANSACTION' && p.resource?.date)
        .map(p => {
          const d = new Date(p.resource!.date as string);
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
  }, [pending]);

  function budgetCategoryFor(item: ApiPendingValidation): ApiDashboardCategory | undefined {
    if (!item.resource?.date || !item.resource.category) return undefined;
    const d = new Date(item.resource.date);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    return budgetCache.get(key)?.find(c => c.category === item.resource!.category);
  }

  const handleExpenseDecisionDone = async () => {
    const action = expenseDecision?.action;
    await load();
    setExpenseDecision(null);
    toast.success(action === 'reject' ? 'Dépense refusée.' : 'Dépense approuvée.');
  };

  const handleGenericDecision = async (comment: string) => {
    if (!genericDecision) return;
    const decider = GENERIC_DECIDERS[genericDecision.item.resourceType];
    if (!decider) return;
    try {
      if (genericDecision.action === 'approve') {
        await decider.approve(genericDecision.item.resourceId, comment || undefined);
      } else {
        await decider.reject(genericDecision.item.resourceId, comment);
      }
      await load();
      setGenericDecision(null);
      toast.success('Décision enregistrée.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de la décision.");
    }
  };

  const isCard = variant === 'card';
  // See the ListTag/ItemTag usage below for why these are dynamic tags,
  // not just classes.
  const ListTag = isCard ? 'ul' : 'div';
  const ItemTag = isCard ? 'li' : 'div';

  const header = (
    <div className={isCard ? 'flex items-center justify-between px-5 py-4' : ''}
      style={isCard ? { borderBottom: '1px solid #F3F4F6' } : undefined}>
      {isCard ? (
        <>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Demandes à valider</h3>
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>{pending.length} au total</span>
        </>
      ) : (
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Demandes à valider</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {pending.length} demande{pending.length > 1 ? 's' : ''} nécessitant une décision
          </p>
        </div>
      )}
    </div>
  );

  const body = loading ? (
    <div className="flex items-center justify-center" style={{ padding: isCard ? '40px 0' : '64px 0' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: '#3E5A78' }} />
    </div>
  ) : pending.length === 0 ? (
    <div className="flex flex-col items-center justify-center text-center"
      style={{ padding: isCard ? '32px 20px' : '64px 20px' }}>
      <CheckCircle2 size={isCard ? 28 : 32} style={{ color: '#065F46', marginBottom: 10 }} />
      <p style={{ color: '#374151', fontSize: isCard ? 14 : 15, fontWeight: 500 }}>Aucune demande en attente</p>
      {isCard && <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>Bonne journée !</p>}
    </div>
  ) : (
    // 'card' (Supervisor Dashboard) keeps its original <ul>/<li> list
    // structure; 'page' (/app/validations) keeps its original plain
    // <div>-per-card structure — same DOM shape each context had before
    // this list was extracted into a shared component, so nothing that
    // targets either page's markup elsewhere breaks.
    <ListTag className={isCard ? '' : 'space-y-3'}>
      {pending.map((item, i) => {
        const isExpense = item.resourceType === 'EXPENSE_TRANSACTION';
        const resourceLabel = RESOURCE_TYPE_LABELS[item.resourceType] ?? item.resourceType;
        const workflowStatus = item.resource?.expenseWorkflowStatus ?? null;
        const workflowStyle = workflowStatus ? EXPENSE_WORKFLOW_STATUS_STYLE[workflowStatus] : null;
        const budgetCategory = isExpense ? budgetCategoryFor(item) : undefined;
        const decider = GENERIC_DECIDERS[item.resourceType];
        const viewLink = RESOURCE_TYPE_LINKS[item.resourceType];

        return (
          <ItemTag key={item.id} className={isCard ? 'px-5 py-4 hover:bg-gray-50' : 'rounded-xl p-5'}
            style={isCard
              ? { borderBottom: i < pending.length - 1 ? '1px solid #F9F7F3' : 'none' }
              : { background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                    {resourceLabel.toUpperCase()}
                  </span>
                  {workflowStatus && workflowStyle && (
                    <span className="px-2 py-0.5 rounded-full" style={{ background: workflowStyle.bg, color: workflowStyle.color, fontSize: 10, fontWeight: 700 }}>
                      {EXPENSE_WORKFLOW_STATUS_LABELS[workflowStatus].toUpperCase()}
                    </span>
                  )}
                </div>

                {isExpense ? (
                  // Expense: category, amount, supplier, budget (below).
                  <>
                    <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{item.resource?.label ?? '—'}</p>
                    <p style={{ color: '#374151', fontSize: 13, marginTop: 2 }}>
                      {item.resource?.amountXof != null ? formatXof(item.resource.amountXof) : '—'}
                      {item.resource?.category ? ` · ${CATEGORY_LABELS[item.resource.category as ApiTransactionCategory]}` : ''}
                      {item.resource?.supplierContact ? ` · ${item.resource.supplierContact.fullName}` : ''}
                    </p>
                  </>
                ) : item.resourceType === 'SUPPLIER_CONTRACT' ? (
                  // Supplier Contract: supplier, contract name, end date.
                  <>
                    <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{item.resource?.contractName ?? '—'}</p>
                    <p style={{ color: '#374151', fontSize: 13, marginTop: 2 }}>
                      {item.resource?.supplierName ?? '—'}
                      {item.resource?.endDate ? ` · Fin : ${new Date(item.resource.endDate).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                  </>
                ) : item.resourceType === 'ADMINISTRATIVE_PROCEDURE' ? (
                  // Administrative Procedure: title, authority, responsible
                  // (linked Contact, falling back to "Aucun responsable"),
                  // current status.
                  <>
                    <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{item.resource?.title ?? '—'}</p>
                    <p style={{ color: '#374151', fontSize: 13, marginTop: 2 }}>
                      {item.resource?.authority ?? '—'} · {responsibleLabel(item.resource)}
                      {item.resource?.status ? ` · ${PROCEDURE_STATUS_LABELS[item.resource.status as keyof typeof PROCEDURE_STATUS_LABELS] ?? item.resource.status}` : ''}
                    </p>
                  </>
                ) : item.resourceType === 'MAINTENANCE_TICKET' ? (
                  // Maintenance: ticket title, assigned contact, priority.
                  <>
                    <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{item.resource?.title ?? '—'}</p>
                    <p style={{ color: '#374151', fontSize: 13, marginTop: 2 }}>
                      {responsibleLabel(item.resource)}
                      {item.resource?.urgency ? ` · ${TICKET_URGENCY_LABELS[item.resource.urgency as keyof typeof TICKET_URGENCY_LABELS] ?? item.resource.urgency}` : ''}
                    </p>
                  </>
                ) : (
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{describeGenericResource(item)}</p>
                )}

                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span style={{ color: '#6B7280', fontSize: 12 }}>Soumis par {item.submittedBy.name}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 12 }}>·</span>
                  <span style={{ color: '#9CA3AF', fontSize: 12 }}>
                    {new Date(item.submittedAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {isExpense && budgetCategory && (
                  <div className="mt-3" style={{ maxWidth: 420 }}>
                    <ExpenseBudgetSummary category={budgetCategory} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Every resource type gets a "Voir" link — falls back to
                    the dashboard for the handful of types with no dedicated
                    page yet (activities, leave requests, fund requests),
                    same as this list always did, rather than silently
                    omitting the link for just those. */}
                <Link to={viewLink ?? '/app/dashboard'} title="Voir"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
                  style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                  Voir <ChevronRight size={12} />
                </Link>
                <button onClick={() => setHistoryTarget(item)} title="Historique de validation"
                  className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: '#F3F4F6', border: 'none', color: '#374151', cursor: 'pointer' }}>
                  <History size={14} />
                </button>
                {isSupervisor && isExpense && (
                  <>
                    <button onClick={() => setExpenseDecision({ action: 'approve', item })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <ShieldCheck size={14} /> Approuver
                    </button>
                    <button onClick={() => setExpenseDecision({ action: 'reject', item })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <ShieldAlert size={14} /> Refuser
                    </button>
                  </>
                )}
                {isSupervisor && !isExpense && decider && (
                  <>
                    <button onClick={() => setGenericDecision({ action: 'approve', item })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <ShieldCheck size={14} /> Approuver
                    </button>
                    <button onClick={() => setGenericDecision({ action: 'reject', item })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <ShieldAlert size={14} /> Refuser
                    </button>
                  </>
                )}
              </div>
            </div>
          </ItemTag>
        );
      })}
    </ListTag>
  );

  const content = (
    <>
      {header}
      {body}
    </>
  );

  return (
    <>
      {isCard ? (
        <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          {content}
        </div>
      ) : (
        <div className="space-y-5">
          {content}
        </div>
      )}

      {expenseDecision && (
        <ExpenseDecisionModal
          action={expenseDecision.action}
          transaction={{
            id: expenseDecision.item.resourceId,
            label: expenseDecision.item.resource?.label ?? '',
            category: (expenseDecision.item.resource?.category ?? 'AUTRE') as ApiTransactionCategory,
            amountXof: expenseDecision.item.resource?.amountXof ?? 0,
            supplierContact: expenseDecision.item.resource?.supplierContact,
          }}
          budgetCategory={budgetCategoryFor(expenseDecision.item)}
          onDone={handleExpenseDecisionDone}
          onClose={() => setExpenseDecision(null)}
        />
      )}
      {genericDecision && (
        <GenericDecisionModal
          action={genericDecision.action}
          onConfirm={handleGenericDecision}
          onClose={() => setGenericDecision(null)}
        />
      )}
      {historyTarget && (
        <ValidationHistoryModal
          resourceType={historyTarget.resourceType}
          resourceId={historyTarget.resourceId}
          title={historyTarget.resourceType === 'EXPENSE_TRANSACTION' ? (historyTarget.resource?.label ?? '') : describeGenericResource(historyTarget)}
          subtitle={RESOURCE_TYPE_LABELS[historyTarget.resourceType] ?? historyTarget.resourceType}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </>
  );
}
