import { api } from './api';
import type { ApiValidationRequest, ApiValidationStatus } from './maintenanceTickets.api';
import type { ApiContact } from '../types/contacts.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiProcedureType =
  | 'AGREMENT' | 'DECLARATION' | 'AUTORISATION' | 'ASSURANCE' | 'CERTIFICAT'
  | 'DOCUMENT_JURIDIQUE' | 'RENOUVELLEMENT' | 'CONVENTION' | 'ATTESTATION' | 'AUTRE';

export type ApiProcedureStatus =
  | 'A_PREPARER' | 'EN_COURS' | 'SOUMIS' | 'EN_ATTENTE_REPONSE'
  | 'APPROUVE' | 'REFUSE' | 'EXPIRE' | 'ARCHIVE';

export type ApiProcedurePriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'CRITIQUE';

export type ApiProcedureValidationAction = 'SUBMISSION' | 'FINALIZATION' | 'RENEWAL' | 'ARCHIVE';

export type ApiProcedureDocumentType =
  | 'FORMULAIRE' | 'COURRIER' | 'RECEPISSE' | 'AGREMENT' | 'AUTORISATION'
  | 'ATTESTATION' | 'ASSURANCE' | 'CERTIFICAT' | 'PIECE_JURIDIQUE'
  | 'REPONSE_ADMINISTRATION' | 'AUTRE';

export interface ApiProcedureDocument {
  id: string;
  procedureId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  documentType: ApiProcedureDocumentType | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface ApiAdministrativeProcedure {
  id: string;
  title: string;
  procedureType: ApiProcedureType;
  authority: string;
  description: string | null;
  referenceNumber: string | null;
  submissionDate: string | null;
  expectedResponseDate: string | null;
  expirationDate: string | null;
  renewalDate: string | null;
  status: ApiProcedureStatus;
  effectiveStatus: ApiProcedureStatus;
  priority: ApiProcedurePriority;
  assignedTo: string | null;
  // PR 9 (Contact directory integration): nullable — null on legacy
  // procedures that predate this PR and were never linked. assignedTo
  // stays as the legacy free-text snapshot field for back-compat.
  assignedContactId: string | null;
  assignedContact: ApiContact | null;
  notes: string | null;
  // Operational tracking only — the external body a procedure is waiting
  // on once status = EN_ATTENTE_REPONSE (Mairie, Préfecture, CAF, …). Free
  // text, not part of the validation workflow.
  pendingResponseOrganization: string | null;
  validationStatus: ApiValidationStatus | null;
  pendingValidationAction: ApiProcedureValidationAction | null;
  createdById: string | null;
  archivedAt: string | null;
  isExpiringSoon: boolean;
  isRenewalDueSoon: boolean;
  isResponseOverdue: boolean;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  daysUntilRenewal: number | null;
  daysWaitingForResponse: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAdministrativeProcedureDetail extends ApiAdministrativeProcedure {
  documents: ApiProcedureDocument[];
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface CreateAdministrativeProcedureInput {
  title: string;
  procedureType: ApiProcedureType;
  authority: string;
  // Operational tracking status — restricted server-side to the
  // pre-submission subset (A_PREPARER / EN_COURS / EN_ATTENTE_REPONSE).
  // Every other status is workflow-only and never sent through this field.
  status?: ApiProcedureStatus;
  description?: string;
  referenceNumber?: string;
  submissionDate?: string;
  expectedResponseDate?: string;
  expirationDate?: string;
  renewalDate?: string;
  priority?: ApiProcedurePriority;
  assignedTo?: string;
  // Source of truth for the relation once set. string: assign/replace.
  // null: explicitly clear an existing assignment (also clears assignedTo).
  // undefined/omitted: leave the current relation untouched.
  assignedContactId?: string | null;
  notes?: string;
  // Free text — only meaningful when status = EN_ATTENTE_REPONSE. null
  // explicitly clears it; undefined/omitted leaves it untouched.
  pendingResponseOrganization?: string | null;
}

export interface ProcedureFilters {
  search?: string;
  procedureType?: ApiProcedureType;
  priority?: ApiProcedurePriority;
  validationStatus?: ApiValidationStatus;
  expiringSoon?: boolean;
  expired?: boolean;
  renewalDueSoon?: boolean;
  responseOverdue?: boolean;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const administrativeProceduresApi = {
  list: (filters?: ProcedureFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.procedureType) qs.set('procedureType', filters.procedureType);
    if (filters?.priority) qs.set('priority', filters.priority);
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    if (filters?.expiringSoon) qs.set('expiringSoon', 'true');
    if (filters?.expired) qs.set('expired', 'true');
    if (filters?.renewalDueSoon) qs.set('renewalDueSoon', 'true');
    if (filters?.responseOverdue) qs.set('responseOverdue', 'true');
    const query = qs.toString();
    return api.get<ApiAdministrativeProcedure[]>(`/administrative-procedures${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiAdministrativeProcedureDetail>(`/administrative-procedures/${id}`),
  create: (data: CreateAdministrativeProcedureInput) =>
    api.post<ApiAdministrativeProcedure>('/administrative-procedures', data),
  update: (id: string, data: Partial<CreateAdministrativeProcedureInput>) =>
    api.patch<ApiAdministrativeProcedure>(`/administrative-procedures/${id}`, data),
  archive: (id: string) => api.patch<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/archive`, {}),
  submitValidation: (id: string, comment?: string) =>
    api.post<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/submit-validation`, { comment }),
  requestRenewal: (id: string, comment?: string) =>
    api.post<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/request-renewal`, { comment }),
  requestArchive: (id: string, comment?: string) =>
    api.post<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/request-archive`, { comment }),
  approve: (id: string, comment?: string) =>
    api.patch<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiAdministrativeProcedure>(`/administrative-procedures/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/administrative-procedures/${id}/validation-history`),
  uploadDocument: (id: string, file: File, documentType?: ApiProcedureDocumentType, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (documentType) form.append('documentType', documentType);
    if (label) form.append('label', label);
    return api.upload<ApiProcedureDocument>(`/administrative-procedures/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiProcedureDocument[]>(`/administrative-procedures/${id}/documents`),
  getDocumentUrl: (procedureId: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/administrative-procedures/${procedureId}/documents/${documentId}/url`),
  deleteDocument: (procedureId: string, documentId: string) =>
    api.delete(`/administrative-procedures/${procedureId}/documents/${documentId}`),
};
