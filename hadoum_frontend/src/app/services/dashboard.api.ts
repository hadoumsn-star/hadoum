import { api } from './api';

// Module 6 — typed client for the four Director/Supervisor dashboard
// aggregate endpoints (backend: hadoum_api/src/dashboard). Every type below
// mirrors the backend response shape exactly (see DashboardService) — no
// field is renamed or reshaped here, so there is never a second, drifting
// definition of what these numbers mean. Components must go through this
// module, never call `api.get('/dashboard/...')` directly.

export type ApiDashboardPeriodType = 'today' | 'week' | 'month' | 'quarter' | 'year';

export const DASHBOARD_PERIOD_OPTIONS: { value: ApiDashboardPeriodType; label: string }[] = [
  { value: 'today',   label: "Aujourd'hui" },
  { value: 'week',    label: 'Cette semaine' },
  { value: 'month',   label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'year',    label: 'Cette année' },
];

export const DEFAULT_DASHBOARD_PERIOD: ApiDashboardPeriodType = 'month';

export interface ApiDashboardPeriod {
  type: ApiDashboardPeriodType;
  start: string;
  end: string;
}

export interface ApiDashboardOverview {
  period: ApiDashboardPeriod;
  children: { totalActive: number; presentToday: number; absentToday: number };
  staff: { totalActive: number; presentToday: number; absentToday: number; nonConfirmedToday: number };
  finance: { budgetTotalXof: number; budgetRestantXof: number };
  donors: { sponsorsActive: number; donationsCount: number; campaignsActive: number };
}

export interface ApiDashboardOperations {
  stockAlertsCount: number;
  proceduresRequiringAttentionCount: number;
  openIncidentsCount: number;
  maintenanceTicketsRequiringAttentionCount: number;
  pendingValidationsCount: number;
}

export interface ApiDashboardFinanceTrendPoint {
  label: string;
  recettesXof: number;
  depensesXof: number;
}

export interface ApiDashboardDonationTrendPoint {
  label: string;
  amountXof: number;
  count: number;
}

export interface ApiDashboardStaffAttendanceTrendPoint {
  label: string;
  present: number;
  absent: number;
  nonConfirmed: number;
}

export interface ApiDashboardTrends {
  period: ApiDashboardPeriod;
  finance: ApiDashboardFinanceTrendPoint[];
  donations: ApiDashboardDonationTrendPoint[];
  staffAttendance: ApiDashboardStaffAttendanceTrendPoint[];
}

export type ApiDashboardAttentionSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ApiDashboardAttentionItem {
  key: string;
  domain: string;
  severity: ApiDashboardAttentionSeverity;
  title: string;
  message: string;
  count: number;
  targetPath: string;
}

export interface ApiDashboardAttention {
  summary: { total: number; critical: number; warning: number; info: number };
  items: ApiDashboardAttentionItem[];
}

function periodQuery(period?: ApiDashboardPeriodType): string {
  return period ? `?period=${period}` : '';
}

export const dashboardApi = {
  getOverview: (period?: ApiDashboardPeriodType) =>
    api.get<ApiDashboardOverview>(`/dashboard/overview${periodQuery(period)}`),
  getOperations: () =>
    api.get<ApiDashboardOperations>('/dashboard/operations'),
  getTrends: (period?: ApiDashboardPeriodType) =>
    api.get<ApiDashboardTrends>(`/dashboard/trends${periodQuery(period)}`),
  getAttention: () =>
    api.get<ApiDashboardAttention>('/dashboard/attention'),
};
