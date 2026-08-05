import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiAuditModule =
  | 'FINANCE'
  | 'CONTACTS'
  | 'MAINTENANCE'
  | 'ADMINISTRATIVE_PROCEDURES'
  | 'SUPPLIER_CONTRACTS'
  | 'STOCK'
  | 'INCIDENTS';

export interface ApiAuditLogUser {
  id: string;
  name: string;
  role: string;
}

export interface ApiAuditLog {
  id: string;
  module: ApiAuditModule;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  user: ApiAuditLogUser | null;
  createdAt: string;
}

export interface AuditLogFilters {
  module?: ApiAuditModule;
  userId?: string;
  entity?: string;
  action?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

function toQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const auditLogsApi = {
  list: (filters: AuditLogFilters = {}) => api.get<ApiAuditLog[]>(`/audit-logs${toQuery(filters)}`),
  listUsers: () => api.get<ApiAuditLogUser[]>('/audit-logs/users'),
};
