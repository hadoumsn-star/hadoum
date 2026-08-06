import { api, ApiError } from './api';
import type { ApiTransactionCategory, ApiTransactionStatus, ApiPaymentMethod } from '../config/financeCategories.config';
import type { ApiContact } from '../types/contacts.types';
import type { ApiValidationRequest } from './maintenanceTickets.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiTransactionType = 'DEPENSE' | 'RECETTE';

// PR 5A-5C (backend) — null means "not part of the workflow" (every RECETTE,
// every pre-PR-5A row). See hadoum_api ExpenseWorkflowService for the state
// machine this drives.
export type ApiExpenseWorkflowStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface ApiTransaction {
  id: string;
  type: ApiTransactionType;
  category: ApiTransactionCategory;
  label: string;
  amountXof: number;
  date: string;
  status: ApiTransactionStatus;
  justifKey: string | null;
  justifMime: string | null;
  donorName: string | null;
  isAnonymousDonor: boolean | null;
  createdBy: string | null;
  createdAt: string;
  // Already returned by the backend (Prisma @updatedAt on Transaction) —
  // just not previously typed. PR 7 uses it to order Recent Activity.
  updatedAt: string;
  // PR 4 — DEPENSE only (see FinancesService); the shared Contact type from
  // PR 2, no second Contact interface.
  supplierContactId: string | null;
  supplierContact: ApiContact | null;
  paymentMethod: ApiPaymentMethod | null;
  purchaseOrderKey: string | null;
  purchaseOrderMime: string | null;
  invoiceKey: string | null;
  invoiceMime: string | null;
  deliveryNoteKey: string | null;
  deliveryNoteMime: string | null;
  expenseWorkflowStatus: ApiExpenseWorkflowStatus | null;
}

export interface ApiBudgetLine {
  id: string;
  category: ApiTransactionCategory;
  month: number;
  year: number;
  budgetXof: number;
}

export interface ApiDashboardCategory {
  category: ApiTransactionCategory;
  realizedXof: number;
  realizedEur: number;
  budgetXof: number | null;
  ecartXof: number | null;
  overBudget: boolean;
  // PR 5C — additive, existing fields above are untouched.
  reservedXof: number;
  consumedXof: number;
  availableXof: number | null;
  reservedPercentage: number | null;
  consumedPercentage: number | null;
  totalCommittedPercentage: number | null;
  committedOverBudget: boolean;
}

export interface ApiDashboardTrendPoint {
  year: number;
  month: number;
  depensesXof: number;
  recettesXof: number;
}

export interface ApiDashboardAlert {
  category: ApiTransactionCategory;
  message: string;
  realizedXof: number;
  budgetXof: number;
}

export interface ApiDashboard {
  period: { year: number; month: number };
  soldeCaisseXof: number;
  soldeCaisseEur: number;
  byCategory: ApiDashboardCategory[];
  monthlyTrend: ApiDashboardTrendPoint[];
  alerts: ApiDashboardAlert[];
}

export interface CreateTransactionInput {
  type: ApiTransactionType;
  category: ApiTransactionCategory;
  label: string;
  amountXof: number;
  date: string;
  status?: ApiTransactionStatus;
  donorName?: string;
  isAnonymousDonor?: boolean;
  createdBy?: string;
  // string: assign/replace (DEPENSE only). null: explicitly clear an
  // existing supplier. undefined/omitted: leave the current one untouched.
  supplierContactId?: string | null;
  paymentMethod?: ApiPaymentMethod;
}

// ─── Expense approval workflow errors (PR 5C/5E) ───────────────────────────────
//
// approveExpense() can fail with two structured business-error bodies (see
// hadoum_api ExpenseWorkflowService.approve). Thrown as typed errors instead
// of a plain ApiError, so the UI can branch with `instanceof` and render the
// numbers directly — same pattern as ContactDuplicateError in contacts.api.ts.
// Any other status/shape (e.g. a plain 409 "transition impossible") still
// surfaces as a normal ApiError, unchanged.

export interface InsufficientBudgetBody {
  code: 'INSUFFICIENT_BUDGET';
  message: string;
  budgetXof: number;
  reservedXof: number;
  consumedXof: number;
  availableXof: number;
  requestedXof: number;
}

export class InsufficientBudgetError extends Error {
  budgetXof: number;
  reservedXof: number;
  consumedXof: number;
  availableXof: number;
  requestedXof: number;
  constructor(body: InsufficientBudgetBody) {
    super(body.message);
    this.name = 'InsufficientBudgetError';
    this.budgetXof = body.budgetXof;
    this.reservedXof = body.reservedXof;
    this.consumedXof = body.consumedXof;
    this.availableXof = body.availableXof;
    this.requestedXof = body.requestedXof;
  }
}

export class NoBudgetLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoBudgetLineError';
  }
}

function isInsufficientBudgetBody(body: unknown): body is InsufficientBudgetBody {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'INSUFFICIENT_BUDGET';
}

function isNoBudgetLineBody(body: unknown): body is { code: 'NO_BUDGET_LINE'; message: string } {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'NO_BUDGET_LINE';
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const financesApi = {
  listTransactions: (filters?: { type?: ApiTransactionType; category?: ApiTransactionCategory; status?: ApiTransactionStatus; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.type)     params.set('type', filters.type);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status)   params.set('status', filters.status);
    if (filters?.from)     params.set('from', filters.from);
    if (filters?.to)       params.set('to', filters.to);
    const qs = params.toString();
    return api.get<ApiTransaction[]>(`/finances/transactions${qs ? `?${qs}` : ''}`);
  },
  getTransaction: (id: string) => api.get<ApiTransaction>(`/finances/transactions/${id}`),
  createTransaction: (data: CreateTransactionInput) => api.post<ApiTransaction>('/finances/transactions', data),
  updateTransaction: (id: string, data: Partial<CreateTransactionInput>) => api.patch<ApiTransaction>(`/finances/transactions/${id}`, data),
  deleteTransaction: (id: string) => api.delete(`/finances/transactions/${id}`),
  uploadJustificatif: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiTransaction>(`/finances/transactions/${id}/justificatif`, form);
  },
  getJustificatifUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/finances/transactions/${id}/justificatif-url`),

  // Dedicated expense documents (PR 4), additive alongside the legacy
  // justificatif methods above — DEPENSE only, see FinancesService.
  uploadPurchaseOrder: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiTransaction>(`/finances/transactions/${id}/purchase-order`, form);
  },
  getPurchaseOrderUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/finances/transactions/${id}/purchase-order-url`),
  deletePurchaseOrder: (id: string) => api.delete<ApiTransaction>(`/finances/transactions/${id}/purchase-order`),

  uploadInvoice: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiTransaction>(`/finances/transactions/${id}/invoice`, form);
  },
  getInvoiceUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/finances/transactions/${id}/invoice-url`),
  deleteInvoice: (id: string) => api.delete<ApiTransaction>(`/finances/transactions/${id}/invoice`),

  uploadDeliveryNote: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiTransaction>(`/finances/transactions/${id}/delivery-note`, form);
  },
  getDeliveryNoteUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/finances/transactions/${id}/delivery-note-url`),
  deleteDeliveryNote: (id: string) => api.delete<ApiTransaction>(`/finances/transactions/${id}/delivery-note`),

  // ─── Expense approval workflow (PR 5A-5E) ────────────────────────────────
  // Reuses the generic validation history endpoint (resourceType
  // EXPENSE_TRANSACTION) — no dedicated Finance history endpoint exists.
  submitExpense: (id: string, comment?: string) =>
    api.post<ApiTransaction>(`/finances/transactions/${id}/submit`, { comment }),
  resubmitExpense: (id: string, comment?: string) =>
    api.post<ApiTransaction>(`/finances/transactions/${id}/resubmit`, { comment }),
  rejectExpense: (id: string, comment: string) =>
    api.post<ApiTransaction>(`/finances/transactions/${id}/reject`, { comment }),
  completeExpense: (id: string) => api.post<ApiTransaction>(`/finances/transactions/${id}/complete`, {}),
  cancelExpense: (id: string) => api.post<ApiTransaction>(`/finances/transactions/${id}/cancel`, {}),
  approveExpense: async (id: string, comment?: string): Promise<ApiTransaction> => {
    try {
      return await api.post<ApiTransaction>(`/finances/transactions/${id}/approve`, { comment });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && isInsufficientBudgetBody(err.body)) {
        throw new InsufficientBudgetError(err.body);
      }
      if (err instanceof ApiError && err.status === 400 && isNoBudgetLineBody(err.body)) {
        throw new NoBudgetLineError(err.body.message);
      }
      throw err;
    }
  },
  getExpenseHistory: (id: string) =>
    api.get<ApiValidationRequest[]>(`/validations/EXPENSE_TRANSACTION/${id}/history`),

  listBudgetLines: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year)  params.set('year', String(year));
    if (month) params.set('month', String(month));
    const qs = params.toString();
    return api.get<ApiBudgetLine[]>(`/finances/budget-lines${qs ? `?${qs}` : ''}`);
  },
  upsertBudgetLine: (data: { category: ApiTransactionCategory; month: number; year: number; budgetXof: number }) =>
    api.put<ApiBudgetLine>('/finances/budget-lines', data),
  deleteBudgetLine: (id: string) => api.delete(`/finances/budget-lines/${id}`),
  // PR 6 — idempotent: creates only the default categories missing for the
  // current month, never overwrites an existing (default or custom) row.
  // Safe to call on every Finance page load.
  ensureDefaultBudgetLines: () => api.post<ApiBudgetLine[]>('/finances/budget-lines/ensure-defaults', {}),

  getDashboard: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year)  params.set('year', String(year));
    if (month) params.set('month', String(month));
    const qs = params.toString();
    return api.get<ApiDashboard>(`/finances/dashboard${qs ? `?${qs}` : ''}`);
  },
};
