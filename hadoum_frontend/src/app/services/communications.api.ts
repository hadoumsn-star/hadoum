import { api } from './api';

// ─── Types — mirror hadoum_api CommunicationsController/Service exactly ──────

export type ApiCommunicationType =
  | 'REPORT_SENT' | 'MESSAGE_SENT' | 'MESSAGE_RECEIVED' | 'ACKNOWLEDGEMENT';
export type ApiCommunicationDirection = 'OUTGOING' | 'INCOMING';

export interface ApiCommunication {
  id: string;
  type: ApiCommunicationType;
  direction: ApiCommunicationDirection | null;
  date: string;
  subject: string;
  content: string | null;
  documentKey: string | null;
  documentMime: string | null;
  donorReportId: string | null;
  createdAt: string;
  donorProfile: {
    id: string;
    type: 'PARRAIN' | 'DONATEUR_PONCTUEL';
    contact: { id: string; fullName: string };
  };
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface PaginatedCommunications {
  data: ApiCommunication[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateCommunicationInput {
  donorProfileId: string;
  type: ApiCommunicationType;
  direction?: ApiCommunicationDirection;
  date: string;
  subject: string;
  content?: string;
}

// Only subject/content are ever accepted by PATCH — see
// UpdateCommunicationDto on the backend; type/direction/date/donor are
// immutable once logged.
export interface UpdateCommunicationInput {
  subject?: string;
  content?: string;
}

export interface ListCommunicationsParams {
  donorProfileId?: string;
  type?: ApiCommunicationType;
  direction?: ApiCommunicationDirection;
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

export const communicationsApi = {
  list: (params: ListCommunicationsParams = {}) =>
    api.get<PaginatedCommunications>(`/communications${buildQuery(params)}`),
  get: (id: string) => api.get<ApiCommunication>(`/communications/${id}`),
  create: (data: CreateCommunicationInput) => api.post<ApiCommunication>('/communications', data),
  update: (id: string, data: UpdateCommunicationInput) =>
    api.patch<ApiCommunication>(`/communications/${id}`, data),
};
