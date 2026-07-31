import { api } from './api';
import type { ApiTransactionCategory, ApiTransactionStatus } from '../config/financeCategories.config';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiTransactionType = 'DEPENSE' | 'RECETTE';

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

  getDashboard: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year)  params.set('year', String(year));
    if (month) params.set('month', String(month));
    const qs = params.toString();
    return api.get<ApiDashboard>(`/finances/dashboard${qs ? `?${qs}` : ''}`);
  },
};
