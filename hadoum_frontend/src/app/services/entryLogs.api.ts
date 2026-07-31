import { api } from './api';
import type { ApiValidationRequest, ApiValidationStatus } from './maintenanceTickets.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiEntryType =
  | 'ENTREE' | 'SORTIE' | 'VISITE_PREVUE' | 'VISITE_IMPREVUE' | 'SORTIE_TEMPORAIRE'
  | 'SORTIE_EXCEPTIONNELLE' | 'RETOUR' | 'PRESTATION' | 'LIVRAISON' | 'AUTRE';

export type ApiVisitorCategory =
  | 'PARENT_TUTEUR' | 'FOURNISSEUR' | 'PRESTATAIRE' | 'MAINTENANCE' | 'LIVRAISON'
  | 'PARTENAIRE' | 'BENEVOLE' | 'ADMINISTRATION' | 'PERSONNEL' | 'VISITEUR' | 'AUTRE';

export type ApiEntryStatus =
  | 'PREVUE' | 'PRESENT' | 'SORTI' | 'ANNULEE' | 'REFUSEE' | 'EN_ATTENTE_VALIDATION' | 'ARCHIVEE';

export type ApiEntryValidationAction =
  | 'EXCEPTIONAL_EXIT' | 'ACCESS_OVERRIDE' | 'AFTER_HOURS_ACCESS' | 'MANUAL_CHECKOUT_OVERRIDE' | 'RECORD_ARCHIVE';

export type ApiRegisterDocumentType =
  | 'AUTORISATION_ACCES' | 'PIECE_IDENTITE' | 'BON_LIVRAISON' | 'BON_SORTIE' | 'PRET_EQUIPEMENT'
  | 'RETOUR_EQUIPEMENT' | 'RAPPORT_INCIDENT' | 'DOCUMENT_VEHICULE' | 'AUTRE';

export interface ApiEntryLogDocument {
  id: string;
  entryLogId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  documentType: ApiRegisterDocumentType | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface ApiEntryLog {
  id: string;
  entryType: ApiEntryType;
  visitorCategory: ApiVisitorCategory;
  fullName: string;
  organization: string | null;
  phone: string | null;
  email: string | null;
  identityDocumentType: string | null;
  identityDocumentNumber: string | null;
  purpose: string | null;
  personVisited: string | null;
  personVisitedUserId: string | null;
  spaceId: string | null;
  arrivalDateTime: string | null;
  expectedDepartureDateTime: string | null;
  actualDepartureDateTime: string | null;
  status: ApiEntryStatus;
  accessBadgeNumber: string | null;
  vehicleRegistration: string | null;
  accompanyingPersonsCount: number;
  authorizedBy: string | null;
  authorizedByUserId: string | null;
  recordedById: string | null;
  notes: string | null;
  incidentReported: boolean;
  incidentId: string | null;
  incidentDescription: string | null;
  validationStatus: ApiValidationStatus | null;
  pendingValidationAction: ApiEntryValidationAction | null;
  archivedAt: string | null;
  isCurrentlyPresent: boolean;
  isExpectedDepartureOverdue: boolean;
  durationOnSiteMinutes: number | null;
  isVisitExpected: boolean;
  isUnauthorizedOrUnvalidated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEntryLogDetail extends ApiEntryLog {
  documents: ApiEntryLogDocument[];
  space: { id: string; name: string } | null;
  personVisitedUser: { id: string; name: string; initials: string; roleLabel: string } | null;
  authorizedByUser: { id: string; name: string; initials: string; roleLabel: string } | null;
  recordedBy: { id: string; name: string; initials: string; roleLabel: string } | null;
  incident: { id: string; title: string; status: string } | null;
}

export interface CreateEntryLogInput {
  entryType: ApiEntryType;
  visitorCategory: ApiVisitorCategory;
  fullName: string;
  organization?: string;
  phone?: string;
  email?: string;
  identityDocumentType?: string;
  identityDocumentNumber?: string;
  purpose: string;
  personVisited?: string;
  personVisitedUserId?: string;
  spaceId?: string;
  arrivalDateTime?: string;
  expectedDepartureDateTime?: string;
  accessBadgeNumber?: string;
  vehicleRegistration?: string;
  accompanyingPersonsCount?: number;
  authorizedBy?: string;
  authorizedByUserId?: string;
  notes?: string;
}

export interface EntryLogFilters {
  search?: string;
  entryType?: ApiEntryType;
  visitorCategory?: ApiVisitorCategory;
  status?: ApiEntryStatus;
  currentlyPresent?: boolean;
  expectedVisit?: boolean;
  overduePresence?: boolean;
  incidentReported?: boolean;
  validationStatus?: ApiValidationStatus;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const entryLogsApi = {
  list: (filters?: EntryLogFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.entryType) qs.set('entryType', filters.entryType);
    if (filters?.visitorCategory) qs.set('visitorCategory', filters.visitorCategory);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.currentlyPresent) qs.set('currentlyPresent', 'true');
    if (filters?.expectedVisit) qs.set('expectedVisit', 'true');
    if (filters?.overduePresence) qs.set('overduePresence', 'true');
    if (filters?.incidentReported !== undefined) qs.set('incidentReported', String(filters.incidentReported));
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    const query = qs.toString();
    return api.get<ApiEntryLog[]>(`/entry-logs${query ? `?${query}` : ''}`);
  },
  currentPresence: () => api.get<ApiEntryLog[]>('/entry-logs/current-presence'),
  expectedVisits: () => api.get<ApiEntryLog[]>('/entry-logs/expected-visits'),
  get: (id: string) => api.get<ApiEntryLogDetail>(`/entry-logs/${id}`),
  create: (data: CreateEntryLogInput) => api.post<ApiEntryLog>('/entry-logs', data),
  update: (id: string, data: Partial<CreateEntryLogInput> & { actualDepartureDateTime?: string }) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}`, data),
  checkIn: (id: string, data?: { arrivalDateTime?: string; accessBadgeNumber?: string; vehicleRegistration?: string; accompanyingPersonsCount?: number }) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/check-in`, data ?? {}),
  checkOut: (id: string, data?: { actualDepartureDateTime?: string }) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/check-out`, data ?? {}),
  cancel: (id: string, reason?: string) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/cancel`, { reason }),
  refuse: (id: string, reason: string) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/refuse`, { reason }),
  archive: (id: string) => api.patch<ApiEntryLog>(`/entry-logs/${id}/archive`, {}),
  approve: (id: string, comment?: string) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiEntryLog>(`/entry-logs/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/entry-logs/${id}/validation-history`),
  uploadDocument: (id: string, file: File, documentType?: ApiRegisterDocumentType, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (documentType) form.append('documentType', documentType);
    if (label) form.append('label', label);
    return api.upload<ApiEntryLogDocument>(`/entry-logs/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiEntryLogDocument[]>(`/entry-logs/${id}/documents`),
  getDocumentUrl: (id: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/entry-logs/${id}/documents/${documentId}/url`),
  deleteDocument: (id: string, documentId: string) =>
    api.delete(`/entry-logs/${id}/documents/${documentId}`),
};
