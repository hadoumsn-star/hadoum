import { api } from './api';
import type { ApiSpaceType } from './spaces.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiIncidentType = 'MEDICAL' | 'COMPORTEMENT' | 'SCOLAIRE' | 'LOGISTIQUE' | 'AUTRE' | 'SECURITE';

// PR 11: EN_ATTENTE is new; PLANIFIE/EN_RETARD are legacy values that can
// still come back from the API on old incidents but are never sent by the
// frontend for a create/status-change (see SELECTABLE_INCIDENT_STATUSES in
// incidents.config.ts).
export type ApiIncidentStatus = 'EN_COURS' | 'EN_ATTENTE' | 'RESOLU' | 'PLANIFIE' | 'EN_RETARD';

export type ApiIncidentPriority = 'N1' | 'N2' | 'N3';

export interface ApiIncidentNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface ApiIncidentStatusHistoryEntry {
  id: string;
  previousStatus: ApiIncidentStatus;
  newStatus: ApiIncidentStatus;
  note: string;
  user: { id: string; name: string; role: string };
  createdAt: string;
}

export interface ApiIncidentChildLink {
  child: { id: string; firstName: string; lastName: string; fileNumber: string };
}

export interface ApiIncidentStaffLink {
  staffMember: { id: string; firstName: string; lastName: string; role: string };
}

export interface ApiIncidentSpaceLink {
  space: { id: string; name: string; type: ApiSpaceType; building: string | null; floor: string | null };
}

export interface ApiIncident {
  id: string;
  title: string;
  type: ApiIncidentType;
  description: string | null;
  signaledBy: string;
  date: string;
  status: ApiIncidentStatus;
  priority: ApiIncidentPriority;
  createdBy: { id: string; name: string; role: string } | null;
  attachmentKey: string | null;
  attachmentMime: string | null;
  notes: ApiIncidentNote[];
  statusHistory: ApiIncidentStatusHistoryEntry[];
  children: ApiIncidentChildLink[];
  staffLinks: ApiIncidentStaffLink[];
  spaces: ApiIncidentSpaceLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncidentInput {
  title: string;
  type: ApiIncidentType;
  description: string;
  signaledBy: string;
  priority: ApiIncidentPriority;
  date?: string;
  childIds?: string[];
  staffIds?: string[];
  spaceIds?: string[];
}

export interface IncidentFilters {
  status?: ApiIncidentStatus;
  priority?: ApiIncidentPriority;
  type?: ApiIncidentType;
  childId?: string;
  staffId?: string;
  spaceId?: string;
  search?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

function toQuery(filters: IncidentFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const incidentsApi = {
  list: (filters: IncidentFilters = {}) => api.get<ApiIncident[]>(`/incidents${toQuery(filters)}`),
  get: (id: string) => api.get<ApiIncident>(`/incidents/${id}`),
  create: (data: CreateIncidentInput) => api.post<ApiIncident>('/incidents', data),
  update: (id: string, data: Partial<CreateIncidentInput>) => api.patch<ApiIncident>(`/incidents/${id}`, data),
  changeStatus: (id: string, status: ApiIncidentStatus, note: string) =>
    api.patch<ApiIncident>(`/incidents/${id}/status`, { status, note }),
  delete: (id: string) => api.delete(`/incidents/${id}`),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiIncident>(`/incidents/${id}/attachment`, form);
  },
  getAttachmentUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/incidents/${id}/attachment-url`),
};
