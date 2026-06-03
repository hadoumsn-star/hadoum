import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiStaffStatus    = 'PRESENT' | 'ABSENT' | 'CONGE';
export type ApiCandidateStatus = 'NOUVEAU' | 'PRESELECTIONNE' | 'ENTRETIEN_FAIT';

export interface ApiStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  classes: string[];
  status: ApiStaffStatus;
  phone: string | null;
  email: string | null;
  since: string;
  cvKey: string | null;
  scheduleKey: string | null;
  scheduleJson: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ApiCandidate {
  id: string;
  firstName: string;
  lastName: string;
  targetRole: string | null;
  phone: string | null;
  status: ApiCandidateStatus;
  cvKey: string | null;
  typeCandidature: string | null;
  disponibleDe: string | null;
  contactInfo: string | null;
  notes: string | null;
  scheduledIntegrationDate: string | null;
  appliedAt: string;
}

export interface ApiFormerMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  exitDate: string;
  exitReason: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const teamApi = {
  // Active staff
  listStaff: () => api.get<ApiStaffMember[]>('/staff'),
  getStaff: (id: string) => api.get<ApiStaffMember>(`/staff/${id}`),
  createStaff: (data: { firstName: string; lastName: string; role: string; classes?: string[]; status?: ApiStaffStatus; phone?: string; email?: string; since?: string }) =>
    api.post<ApiStaffMember>('/staff', data),
  updateStaff: (id: string, data: Partial<{ firstName: string; lastName: string; role: string; classes: string[]; status: ApiStaffStatus; phone: string; email: string; notes: string; scheduleJson: string | null }>) =>
    api.patch<ApiStaffMember>(`/staff/${id}`, data),
  exitStaff: (id: string, exitReason: string, exitDate: string) =>
    api.post<ApiFormerMember>(`/staff/${id}/exit`, { exitReason, exitDate }),
  uploadStaffCv: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiStaffMember>(`/staff/${id}/cv`, form);
  },
  uploadStaffSchedule: (id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<ApiStaffMember>(`/staff/${id}/schedule`, form);
  },
  uploadStaffDoc: (id: string, file: File, label: string) => {
    const form = new FormData(); form.append('file', file); form.append('label', label);
    return api.upload<{ key: string; label: string }>(`/staff/${id}/docs`, form);
  },
  getStaffFileUrl: (id: string, type: 'cv' | 'schedule') =>
    api.get<{ url: string }>(`/staff/${id}/${type}-url`),
  listStaffDocs: (id: string) =>
    api.get<{ id: string; key: string; label: string; createdAt: string }[]>(`/staff/${id}/docs`),
  getStaffDocUrl: (id: string, docId: string) =>
    api.get<{ url: string }>(`/staff/${id}/docs/${docId}/url`),
  deleteStaffDoc: (id: string, docId: string) =>
    api.delete(`/staff/${id}/docs/${docId}`),

  // Attendance
  createAttendance: (staffId: string, data: { type: string; motif?: string; dateDebut: string; dateFin?: string; justified?: boolean }, justifFile?: File) => {
    const form = new FormData();
    form.append('type', data.type);
    if (data.motif)              form.append('motif', data.motif);
    form.append('dateDebut', data.dateDebut);
    if (data.dateFin)            form.append('dateFin', data.dateFin);
    if (data.justified != null)  form.append('justified', String(data.justified));
    if (justifFile)              form.append('justif', justifFile);
    return api.upload<{ id: string; type: string; motif: string | null; dateDebut: string; dateFin: string | null; justifKey: string | null; justified: boolean; createdAt: string }>(`/staff/${staffId}/attendance`, form);
  },
  getAttendance: (staffId: string) =>
    api.get<{ id: string; type: string; motif: string | null; dateDebut: string; dateFin: string | null; justifKey: string | null; justified: boolean; createdAt: string }[]>(`/staff/${staffId}/attendance`),
  getAttendancePeriod: (from: string, to: string) =>
    api.get<{ id: string; staffId: string; type: string; dateDebut: string; dateFin: string | null }[]>(
      `/staff/attendance/monthly?from=${from}&to=${to}`
    ),
  updateAttendance: (recordId: string, data: { type?: string; motif?: string; dateDebut?: string; dateFin?: string | null; justified?: boolean }) =>
    api.patch<{ id: string; type: string; motif: string | null; dateDebut: string; dateFin: string | null; justifKey: string | null; justified: boolean; createdAt: string }>(`/staff/attendance/${recordId}`, data),
  deleteAttendance: (recordId: string) =>
    api.delete(`/staff/attendance/${recordId}`),
  uploadAttendanceJustif: (recordId: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.upload<{ id: string; justifKey: string | null }>(`/staff/attendance/${recordId}/justif`, form);
  },
  getAttendanceJustifUrl: (recordId: string) =>
    api.get<{ url: string }>(`/staff/attendance/${recordId}/justif-url`),

  // Candidates
  listCandidates: () => api.get<ApiCandidate[]>('/staff/candidates'),
  createCandidate: (data: { firstName: string; lastName: string; targetRole?: string; phone?: string; status?: ApiCandidateStatus; typeCandidature?: string; disponibleDe?: string; contactInfo?: string; notes?: string }) =>
    api.post<ApiCandidate>('/staff/candidates', data),
  updateCandidate: (id: string, data: { status?: ApiCandidateStatus; targetRole?: string; phone?: string; typeCandidature?: string; disponibleDe?: string; contactInfo?: string; notes?: string; scheduledIntegrationDate?: string | null }) =>
    api.patch<ApiCandidate>(`/staff/candidates/${id}`, data),
  uploadCv: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<ApiCandidate>(`/staff/candidates/${id}/cv`, form);
  },
  getCvUrl: (id: string) =>
    api.get<{ url: string; expiresIn: number }>(`/staff/candidates/${id}/cv-url`),
  uploadCandidateDoc: (id: string, file: File, label: string) => {
    const form = new FormData(); form.append('file', file); form.append('label', label);
    return api.upload<{ id: string; key: string; label: string; createdAt: string }>(`/staff/candidates/${id}/docs`, form);
  },
  listCandidateDocs: (id: string) =>
    api.get<{ id: string; key: string; label: string; createdAt: string }[]>(`/staff/candidates/${id}/docs`),
  getCandidateDocUrl: (id: string, docId: string) =>
    api.get<{ url: string }>(`/staff/candidates/${id}/docs/${docId}/url`),
  deleteCandidateDoc: (id: string, docId: string) =>
    api.delete(`/staff/candidates/${id}/docs/${docId}`),
  promote: (id: string, role?: string, since?: string) =>
    api.post<ApiStaffMember>(`/staff/candidates/${id}/promote`, { role, since }),

  // Former
  listFormer: () => api.get<ApiFormerMember[]>('/staff/former'),
  reintegrate: (id: string, role: string, reintegrationDate: string) =>
    api.post<ApiStaffMember>(`/staff/former/${id}/reintegrate`, { role, reintegrationDate }),
};

// ─── Mappers (API → frontend legacy types) ────────────────────────────────────

export function mapStaff(m: ApiStaffMember) {
  const initials = `${m.firstName[0] ?? '?'}${m.lastName[0] ?? '?'}`.toUpperCase();
  return {
    apiId:       m.id,
    id:          m.id,
    name:        `${m.firstName} ${m.lastName}`,
    role:        m.role,
    classes:     m.classes,
    status:      m.status === 'PRESENT' ? 'present' : m.status === 'ABSENT' ? 'absent' : 'conge' as 'present' | 'absent' | 'conge',
    phone:       m.phone  ?? '—',
    email:       m.email  ?? '—',
    since:       m.since,
    cvKey:        m.cvKey        ?? null,
    scheduleKey:  m.scheduleKey  ?? null,
    scheduleJson: m.scheduleJson ?? null,
    notes:        m.notes        ?? '',
    initials,
  };
}

export function mapCandidate(c: ApiCandidate) {
  return {
    apiId:          c.id,
    id:             c.id,
    prenom:         c.firstName,
    nom:            c.lastName,
    posteVise:      c.targetRole ?? '',
    telephone:      c.phone ?? '',
    statut:         (c.status === 'PRESELECTIONNE' ? 'présélectionné' : c.status === 'ENTRETIEN_FAIT' ? 'entretien fait' : 'nouveau') as 'nouveau' | 'présélectionné' | 'entretien fait',
    cvUploaded:     !!c.cvKey,
    cvKey:          c.cvKey ?? null,
    typeCandidature:         c.typeCandidature ?? null,
    disponibleDe:            c.disponibleDe ?? null,
    notes:                   c.notes ?? null,
    contactInfo:             c.contactInfo ?? null,
    scheduledIntegrationDate: c.scheduledIntegrationDate ?? null,
    dateCandidate:           new Date(c.appliedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
}

export function mapFormer(m: ApiFormerMember) {
  const initials = `${m.firstName[0] ?? '?'}${m.lastName[0] ?? '?'}`.toUpperCase();
  return {
    apiId:       m.id,
    id:          m.id,
    name:        `${m.firstName} ${m.lastName}`,
    role:        m.role,
    dateSortie:  new Date(m.exitDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
    motifSortie: m.exitReason,
    initials,
  };
}
