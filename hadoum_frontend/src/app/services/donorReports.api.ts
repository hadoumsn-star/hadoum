import { api } from './api';

// ─── Types — mirror hadoum_api DonorReportsController/Service exactly ────────

export type ApiDonorReportPeriodType = 'MENSUEL' | 'TRIMESTRIEL';
export type ApiDonorReportStatus = 'DRAFT' | 'GENERATED' | 'SENT';

export interface ApiDonorReportPhoto {
  id: string;
  fileKey: string;
  fileMime: string;
  caption: string | null;
  approvedForDonorReport: boolean;
  createdAt: string;
}

export interface ApiDonorReport {
  id: string;
  periodType: ApiDonorReportPeriodType;
  periodStart: string;
  periodEnd: string;
  status: ApiDonorReportStatus;
  generatedAt: string | null;
  sentAt: string | null;
  fileKey: string | null;
  fileMime: string | null;
  activitiesNarrative: string | null;
  financialSummarySnapshot: {
    donorContributionXof: number;
    donorContributionCount: number;
    orphanageTotalReceivedXof: number;
    campaignContributions: { campaignTitle: string; amountXof: number }[];
  } | null;
  photos: ApiDonorReportPhoto[];
  createdAt: string;
  updatedAt: string;
  donorProfile: {
    id: string;
    type: 'PARRAIN' | 'DONATEUR_PONCTUEL';
    contact: { id: string; fullName: string };
  };
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface PaginatedDonorReports {
  data: ApiDonorReport[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDonorReportInput {
  donorProfileId: string;
  periodType: ApiDonorReportPeriodType;
  periodStart: string;
  periodEnd: string;
  activitiesNarrative?: string;
}

export interface ListDonorReportsParams {
  donorProfileId?: string;
  status?: ApiDonorReportStatus;
  periodType?: ApiDonorReportPeriodType;
  from?: string;
  to?: string;
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

export const donorReportsApi = {
  list: (params: ListDonorReportsParams = {}) =>
    api.get<PaginatedDonorReports>(`/donor-reports${buildQuery(params)}`),
  get: (id: string) => api.get<ApiDonorReport>(`/donor-reports/${id}`),
  create: (data: CreateDonorReportInput) => api.post<ApiDonorReport>('/donor-reports', data),
  generate: (id: string, activitiesNarrative?: string) =>
    api.post<ApiDonorReport>(`/donor-reports/${id}/generate`, { activitiesNarrative }),
  markSent: (id: string) => api.post<ApiDonorReport>(`/donor-reports/${id}/mark-sent`, {}),
  getFileUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/donor-reports/${id}/file-url`),

  // Photos
  uploadPhoto: (id: string, file: File, caption?: string, approved?: boolean) => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    if (approved) form.append('approved', 'true');
    return api.upload<ApiDonorReportPhoto>(`/donor-reports/${id}/photos`, form);
  },
  getPhotoUrl: (reportId: string, photoId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/donor-reports/${reportId}/photos/${photoId}/url`),
  approvePhoto: (reportId: string, photoId: string) =>
    api.patch<ApiDonorReportPhoto>(`/donor-reports/${reportId}/photos/${photoId}/approve`, {}),
  deletePhoto: (reportId: string, photoId: string) =>
    api.delete(`/donor-reports/${reportId}/photos/${photoId}`),
};
