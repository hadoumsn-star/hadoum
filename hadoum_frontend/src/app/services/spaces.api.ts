import { api } from './api';
import type { ApiTicketUrgency, ApiTicketStatus } from './maintenanceTickets.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiSpaceType =
  | 'SALLE_CLASSE' | 'DORTOIR' | 'CUISINE' | 'SANITAIRE' | 'BUREAU'
  | 'INFIRMERIE' | 'STOCKAGE' | 'ESPACE_EXTERIEUR' | 'AUTRE';

export type ApiSpaceCondition = 'BON' | 'MOYEN' | 'MAUVAIS' | 'HORS_SERVICE';

export type { ApiTicketUrgency, ApiTicketStatus };

export interface ApiSpaceDocument {
  id: string;
  spaceId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  createdAt: string;
}

export interface ApiMaintenanceTicketSummary {
  id: string;
  title: string;
  urgency: ApiTicketUrgency;
  status: ApiTicketStatus;
  reportedDate: string;
  createdAt: string;
}

export interface ApiSpace {
  id: string;
  name: string;
  type: ApiSpaceType;
  description: string | null;
  building: string | null;
  floor: string | null;
  zone: string | null;
  condition: ApiSpaceCondition;
  capacity: number | null;
  equipment: string[];
  observations: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSpaceDetail extends ApiSpace {
  documents: ApiSpaceDocument[];
  maintenanceTickets: ApiMaintenanceTicketSummary[];
}

export interface CreateSpaceInput {
  name: string;
  type: ApiSpaceType;
  description?: string;
  building?: string;
  floor?: string;
  zone?: string;
  condition?: ApiSpaceCondition;
  capacity?: number;
  equipment?: string[];
  observations?: string;
  isActive?: boolean;
}

export interface SpaceFilters {
  type?: ApiSpaceType;
  condition?: ApiSpaceCondition;
  isActive?: boolean;
  search?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const spacesApi = {
  list: (filters?: SpaceFilters) => {
    const qs = new URLSearchParams();
    if (filters?.type) qs.set('type', filters.type);
    if (filters?.condition) qs.set('condition', filters.condition);
    if (filters?.isActive !== undefined) qs.set('isActive', String(filters.isActive));
    if (filters?.search) qs.set('search', filters.search);
    const query = qs.toString();
    return api.get<ApiSpace[]>(`/spaces${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiSpaceDetail>(`/spaces/${id}`),
  create: (data: CreateSpaceInput) => api.post<ApiSpace>('/spaces', data),
  update: (id: string, data: Partial<CreateSpaceInput>) => api.patch<ApiSpace>(`/spaces/${id}`, data),
  archive: (id: string) => api.patch<ApiSpace>(`/spaces/${id}/archive`, {}),
  uploadDocument: (id: string, file: File, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (label) form.append('label', label);
    return api.upload<ApiSpaceDocument>(`/spaces/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiSpaceDocument[]>(`/spaces/${id}/documents`),
  getDocumentUrl: (spaceId: string, docId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/spaces/${spaceId}/documents/${docId}/url`),
  deleteDocument: (spaceId: string, docId: string) => api.delete(`/spaces/${spaceId}/documents/${docId}`),
};
