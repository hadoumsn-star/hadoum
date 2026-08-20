import { api } from './api';
import type { ApiPaymentMethod } from '../config/financeCategories.config';

// ─── Types — mirror hadoum_api DonationsController/DonationsService exactly ──

export interface ApiDonation {
  id: string;
  amountXof: number;
  date: string;
  paymentMethod: ApiPaymentMethod | null;
  reference: string | null;
  notes: string | null;
  transactionId: string;
  createdAt: string;
  donorProfile: {
    id: string;
    type: 'PARRAIN' | 'DONATEUR_PONCTUEL';
    contact: { id: string; fullName: string };
  };
  campaign: { id: string; title: string; status: string } | null;
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface PaginatedDonations {
  data: ApiDonation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDonationInput {
  donorProfileId: string;
  campaignId?: string;
  amountXof: number;
  date: string;
  paymentMethod?: ApiPaymentMethod;
  reference?: string;
  notes?: string;
  // Client-generated once per "record this donation" user action and
  // resent verbatim on any retry — see useIdempotencyKey. Never a new value
  // per HTTP attempt.
  idempotencyKey?: string;
}

export interface UpdateDonationInput {
  reference?: string;
  notes?: string;
}

export interface ListDonationsParams {
  donorProfileId?: string;
  campaignId?: string;
  from?: string;
  to?: string;
  minAmountXof?: number;
  maxAmountXof?: number;
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
//
// create() is intentionally the ONLY write here — it's what triggers
// POST /donations, which the backend handles atomically alongside the
// Finance Transaction (see DonationsService.create). The frontend never
// makes a second call to create/adjust a Transaction itself.

export const donationsApi = {
  list: (params: ListDonationsParams = {}) =>
    api.get<PaginatedDonations>(`/donations${buildQuery(params)}`),
  get: (id: string) => api.get<ApiDonation>(`/donations/${id}`),
  create: (data: CreateDonationInput) => api.post<ApiDonation>('/donations', data),
  update: (id: string, data: UpdateDonationInput) => api.patch<ApiDonation>(`/donations/${id}`, data),
};
