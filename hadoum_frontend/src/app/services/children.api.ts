import { api } from './api';
import type {
  ApiChildSummary,
  ApiChildFull,
  ApiDocument,
  ApiEventLog,
  ApiMedicalRecord,
  ApiVaccination,
  ApiConsultation,
  ApiDailyObservation,
  CreateChildPayload,
  ApiDocumentType,
  ApiGender,
  ApiChildStatus,
} from '../types/api.types';

export const childrenApi = {
  // ─── Children CRUD ──────────────────────────────────────────────────────────

  list: () =>
    api.get<ApiChildSummary[]>('/children'),

  get: (id: string) =>
    api.get<ApiChildFull>(`/children/${id}`),

  create: (payload: CreateChildPayload) =>
    api.post<ApiChildFull>('/children', payload),

  update: (id: string, payload: Partial<CreateChildPayload>) =>
    api.patch<ApiChildFull>(`/children/${id}`, payload),

  exitChild: (id: string, data: { exitType: string; exitDate: string; exitReason: string; exitResponsable?: string; dateRetour?: string }) =>
    api.post(`/children/${id}/exit`, data),

  reactivateChild: (id: string) =>
    api.post(`/children/${id}/reactivate`, {}),

  // ─── Medical ────────────────────────────────────────────────────────────────

  upsertSchool: (childId: string, data: { currentLevel: string; schoolName?: string }) =>
    api.post(`/children/${childId}/school`, data),

  upsertMedical: (childId: string, data: { bloodType?: string; allergies?: string; currentTreatments?: string; vaccinationsText?: string; consultationsText?: string }) =>
    api.post<ApiMedicalRecord>(`/children/${childId}/medical`, data),

  addVaccination: (childId: string, data: { name: string; date: string; nextDueDate?: string; notes?: string }) =>
    api.post<ApiVaccination>(`/children/${childId}/medical/vaccinations`, data),

  addConsultation: (childId: string, data: { date: string; doctor: string; reason: string; prescription?: string; documentUrl?: string }) =>
    api.post<ApiConsultation>(`/children/${childId}/medical/consultations`, data),

  // ─── Observations ───────────────────────────────────────────────────────────

  addObservation: (childId: string, data: { date: string; author: string; behavior: string; groupIntegration?: string; incidents?: string; notes?: string }) =>
    api.post<ApiDailyObservation>(`/children/${childId}/observations`, data),

  getObservations: (childId: string) =>
    api.get<ApiDailyObservation[]>(`/children/${childId}/observations`),

  // ─── Events ─────────────────────────────────────────────────────────────────

  addEvent: (childId: string, data: { eventType: string; summary: string; details?: string; author?: string }) =>
    api.post<ApiEventLog>(`/children/${childId}/events`, data),

  getEvents: (childId: string) =>
    api.get<ApiEventLog[]>(`/children/${childId}/events`),

  deleteEvent: (childId: string, eventId: string) =>
    api.delete(`/children/${childId}/events/${eventId}`),

  // ─── Documents ──────────────────────────────────────────────────────────────

  addDocument: (childId: string, data: { type: ApiDocumentType; label: string; fileUrl: string; uploadedBy?: string }) =>
    api.post<ApiDocument>(`/children/${childId}/documents`, data),

  replaceDocument: (childId: string, docId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<ApiDocument>(`/children/${childId}/documents/${docId}/replace`, form);
  },

  uploadDocument: (childId: string, file: File, type: ApiDocumentType, label: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('label', label);
    form.append('uploadedBy', 'staff');
    return api.upload<ApiDocument>(`/children/${childId}/documents/upload`, form);
  },

  getDocuments: (childId: string) =>
    api.get<ApiDocument[]>(`/children/${childId}/documents`),

  getDocumentUrl: (childId: string, docId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/children/${childId}/documents/${docId}/url`),
};

// Re-export types for convenience
export type { ApiGender, ApiChildStatus };
