import { api } from './api';

// ─── Types — mirror hadoum_api DonorsController/DonorsService exactly ────────

export type ApiDonorType = 'PARRAIN' | 'DONATEUR_PONCTUEL';

export interface ApiDonorContact {
  id: string;
  fullName: string;
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  photoKey: string | null;
  photoMime: string | null;
  active: boolean;
}

export interface ApiDonorProfile {
  id: string;
  type: ApiDonorType;
  country: string | null;
  engagementStartDate: string | null;
  monthlyContributionXof: number | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contact: ApiDonorContact;
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface PaginatedDonorProfiles {
  data: ApiDonorProfile[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDonorProfileInput {
  contactId: string;
  type: ApiDonorType;
  country?: string;
  engagementStartDate?: string;
  monthlyContributionXof?: number;
  notes?: string;
}

// `null` explicitly clears a recurring field while staying PARRAIN;
// `undefined`/omitted leaves the current value untouched — see
// DonorsService.update on the backend.
export interface UpdateDonorProfileInput {
  type?: ApiDonorType;
  country?: string;
  engagementStartDate?: string | null;
  monthlyContributionXof?: number | null;
  notes?: string;
}

export interface ListDonorProfilesParams {
  type?: ApiDonorType;
  active?: boolean;
  country?: string;
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

export const donorProfilesApi = {
  list: (params: ListDonorProfilesParams = {}) =>
    api.get<PaginatedDonorProfiles>(`/donors${buildQuery(params)}`),
  get: (id: string) => api.get<ApiDonorProfile>(`/donors/${id}`),
  create: (data: CreateDonorProfileInput) => api.post<ApiDonorProfile>('/donors', data),
  update: (id: string, data: UpdateDonorProfileInput) => api.patch<ApiDonorProfile>(`/donors/${id}`, data),
  deactivate: (id: string) => api.patch<ApiDonorProfile>(`/donors/${id}/deactivate`, {}),
  reactivate: (id: string) => api.patch<ApiDonorProfile>(`/donors/${id}/reactivate`, {}),
};
