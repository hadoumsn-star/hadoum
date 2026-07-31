import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiIncidentType = 'MEDICAL' | 'COMPORTEMENT' | 'SCOLAIRE' | 'LOGISTIQUE' | 'AUTRE';
export type ApiIncidentStatus = 'EN_COURS' | 'PLANIFIE' | 'EN_RETARD' | 'RESOLU';

export interface ApiIncidentNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface ApiIncident {
  id: string;
  title: string;
  type: ApiIncidentType;
  description: string | null;
  signaledBy: string;
  date: string;
  status: ApiIncidentStatus;
  attachmentKey: string | null;
  attachmentMime: string | null;
  notes: ApiIncidentNote[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncidentInput {
  title: string;
  type: ApiIncidentType;
  description?: string;
  signaledBy: string;
  date?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const incidentsApi = {
  list: () => api.get<ApiIncident[]>('/incidents'),
  create: (data: CreateIncidentInput) => api.post<ApiIncident>('/incidents', data),
  addNote: (id: string, text: string, author: string) =>
    api.post<ApiIncident>(`/incidents/${id}/notes`, { text, author }),
  resolve: (id: string) => api.patch<ApiIncident>(`/incidents/${id}/resolve`, {}),
  update: (id: string, data: Partial<CreateIncidentInput>) => api.patch<ApiIncident>(`/incidents/${id}`, data),
  delete: (id: string) => api.delete(`/incidents/${id}`),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiIncident>(`/incidents/${id}/attachment`, form);
  },
  getAttachmentUrl: (id: string) => api.get<{ url: string; expiresIn: number }>(`/incidents/${id}/attachment-url`),
};
