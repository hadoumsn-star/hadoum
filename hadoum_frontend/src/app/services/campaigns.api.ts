import { api } from './api';

// ─── Types — mirror hadoum_api CampaignsController/CampaignsService exactly ──

export type ApiCampaignStatus = 'BROUILLON' | 'ACTIVE' | 'TERMINEE' | 'ANNULEE';

export interface ApiCampaignDocument {
  id: string;
  campaignId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  createdAt: string;
}

// collectedAmountXof/remainingAmountXof/progressPercentage/donationsCount are
// always backend-computed (never stored) — the frontend must never
// recalculate these from Donation rows itself, only display them.
export interface ApiCampaign {
  id: string;
  title: string;
  description: string | null;
  targetAmountXof: number;
  startDate: string;
  endDate: string | null;
  status: ApiCampaignStatus;
  utilizationReport: string | null;
  collectedAmountXof: number;
  remainingAmountXof: number;
  progressPercentage: number | null;
  donationsCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface PaginatedCampaigns {
  data: ApiCampaign[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateCampaignInput {
  title: string;
  description?: string;
  targetAmountXof: number;
  startDate: string;
  endDate?: string;
  utilizationReport?: string;
}

export interface ListCampaignsParams {
  status?: ApiCampaignStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const campaignsApi = {
  list: (params: ListCampaignsParams = {}) =>
    api.get<PaginatedCampaigns>(`/campaigns${buildQuery(params)}`),
  get: (id: string) => api.get<ApiCampaign>(`/campaigns/${id}`),
  create: (data: CreateCampaignInput) => api.post<ApiCampaign>('/campaigns', data),
  update: (id: string, data: Partial<CreateCampaignInput>) => api.patch<ApiCampaign>(`/campaigns/${id}`, data),

  // Lifecycle — dedicated endpoints, never an arbitrary status PATCH (the
  // backend has no such route; see CampaignsController).
  activate: (id: string) => api.post<ApiCampaign>(`/campaigns/${id}/activate`, {}),
  terminate: (id: string) => api.post<ApiCampaign>(`/campaigns/${id}/terminate`, {}),
  cancel: (id: string) => api.post<ApiCampaign>(`/campaigns/${id}/cancel`, {}),

  // Documents
  uploadDocument: (id: string, file: File, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (label) form.append('label', label);
    return api.upload<ApiCampaignDocument>(`/campaigns/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiCampaignDocument[]>(`/campaigns/${id}/documents`),
  getDocumentUrl: (campaignId: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/campaigns/${campaignId}/documents/${documentId}/url`),
  deleteDocument: (campaignId: string, documentId: string) =>
    api.delete(`/campaigns/${campaignId}/documents/${documentId}`),
};
