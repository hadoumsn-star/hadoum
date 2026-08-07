import { api } from './api';
import type { ApiContact } from '../types/contacts.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiTicketUrgency = 'FAIBLE' | 'MOYENNE' | 'ELEVEE' | 'CRITIQUE';
export type ApiTicketStatus = 'OUVERT' | 'ASSIGNE' | 'EN_COURS' | 'EN_ATTENTE' | 'RESOLU' | 'FERME' | 'ANNULE';
export type ApiValidationStatus = 'DRAFT' | 'PENDING_VALIDATION' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface ApiTicketAttachment {
  id: string;
  ticketId: string;
  fileKey: string;
  fileMime: string;
  createdAt: string;
}

export interface ApiValidationUser {
  id: string;
  name: string;
  initials: string;
  roleLabel: string;
}

export interface ApiValidationRequest {
  id: string;
  resourceType: string;
  resourceId: string;
  status: ApiValidationStatus;
  previousStatus: ApiValidationStatus | null;
  submittedBy: ApiValidationUser;
  submittedAt: string;
  reviewedBy: ApiValidationUser | null;
  reviewedAt: string | null;
  comment: string | null;
  createdAt: string;
}

export interface ApiMaintenanceTicket {
  id: string;
  title: string;
  description: string | null;
  problemType: string | null;
  spaceId: string;
  space: { id: string; name: string };
  urgency: ApiTicketUrgency;
  status: ApiTicketStatus;
  reportedDate: string;
  reportedBy: string;
  assignedTo: string | null;
  // Source of truth for the relation; assignedTo above becomes a display
  // snapshot derived from it once set (see MaintenanceTicketsService). Kept
  // as the shared ApiContact type from PR 2 — no second Contact interface.
  assignedContactId: string | null;
  assignedContact: ApiContact | null;
  plannedDate: string | null;
  resolvedDate: string | null;
  resolutionNotes: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  validationStatus: ApiValidationStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMaintenanceTicketDetail extends ApiMaintenanceTicket {
  attachments: ApiTicketAttachment[];
}

export interface CreateMaintenanceTicketInput {
  title: string;
  spaceId: string;
  description?: string;
  problemType?: string;
  urgency: ApiTicketUrgency;
  reportedBy: string;
  // assignedTo kept for backward compatibility with any other API client
  // still submitting free text — the ticket form itself no longer sends it
  // (see TicketsMaintenancePage), sending assignedContactId instead.
  assignedTo?: string;
  // string: assign/replace. null: explicitly clear an existing assignment.
  // undefined/omitted: leave the current assignment untouched.
  assignedContactId?: string | null;
  plannedDate?: string;
  estimatedCost?: number;
}

export interface TicketFilters {
  spaceId?: string;
  status?: ApiTicketStatus;
  urgency?: ApiTicketUrgency;
  validationStatus?: ApiValidationStatus;
  search?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const maintenanceTicketsApi = {
  list: (filters?: TicketFilters) => {
    const qs = new URLSearchParams();
    if (filters?.spaceId) qs.set('spaceId', filters.spaceId);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.urgency) qs.set('urgency', filters.urgency);
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    if (filters?.search) qs.set('search', filters.search);
    const query = qs.toString();
    return api.get<ApiMaintenanceTicket[]>(`/maintenance-tickets${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiMaintenanceTicketDetail>(`/maintenance-tickets/${id}`),
  create: (data: CreateMaintenanceTicketInput) => api.post<ApiMaintenanceTicket>('/maintenance-tickets', data),
  update: (id: string, data: Partial<CreateMaintenanceTicketInput>) =>
    api.patch<ApiMaintenanceTicket>(`/maintenance-tickets/${id}`, data),
  assign: (id: string, assignedTo: string) =>
    api.patch<ApiMaintenanceTicket>(`/maintenance-tickets/${id}/assign`, { assignedTo }),
  close: (id: string) => api.patch<ApiMaintenanceTicket>(`/maintenance-tickets/${id}/close`, {}),
  submitValidation: (id: string, comment?: string) =>
    api.post<ApiMaintenanceTicket>(`/maintenance-tickets/${id}/submit-validation`, { comment }),
  approve: (id: string, comment?: string) =>
    api.patch<ApiMaintenanceTicket>(`/maintenance-tickets/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiMaintenanceTicket>(`/maintenance-tickets/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiMaintenanceTicket>(`/maintenance-tickets/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/maintenance-tickets/${id}/validation-history`),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<ApiTicketAttachment>(`/maintenance-tickets/${id}/attachments`, form);
  },
  listAttachments: (id: string) => api.get<ApiTicketAttachment[]>(`/maintenance-tickets/${id}/attachments`),
  getAttachmentUrl: (ticketId: string, attachmentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/maintenance-tickets/${ticketId}/attachments/${attachmentId}/url`),
  deleteAttachment: (ticketId: string, attachmentId: string) =>
    api.delete(`/maintenance-tickets/${ticketId}/attachments/${attachmentId}`),
};
