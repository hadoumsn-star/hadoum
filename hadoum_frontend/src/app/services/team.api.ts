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
  createStaff: (data: { firstName: string; lastName: string; role: string; classes?: string[]; status?: ApiStaffStatus; phone?: string; email?: string; since?: string }) =>
    api.post<ApiStaffMember>('/staff', data),
  updateStaff: (id: string, data: Partial<{ firstName: string; lastName: string; role: string; classes: string[]; status: ApiStaffStatus; phone: string; email: string }>) =>
    api.patch<ApiStaffMember>(`/staff/${id}`, data),
  exitStaff: (id: string, exitReason: string, exitDate: string) =>
    api.post<ApiFormerMember>(`/staff/${id}/exit`, { exitReason, exitDate }),

  // Candidates
  listCandidates: () => api.get<ApiCandidate[]>('/staff/candidates'),
  createCandidate: (data: { firstName: string; lastName: string; targetRole?: string; phone?: string }) =>
    api.post<ApiCandidate>('/staff/candidates', data),
  updateCandidate: (id: string, data: { status?: ApiCandidateStatus; targetRole?: string; phone?: string }) =>
    api.patch<ApiCandidate>(`/staff/candidates/${id}`, data),
  uploadCv: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<ApiCandidate>(`/staff/candidates/${id}/cv`, form);
  },
  getCvUrl: (id: string) =>
    api.get<{ url: string; expiresIn: number }>(`/staff/candidates/${id}/cv-url`),
  promote: (id: string) =>
    api.post<ApiStaffMember>(`/staff/candidates/${id}/promote`, {}),

  // Former
  listFormer: () => api.get<ApiFormerMember[]>('/staff/former'),
  reintegrate: (id: string, role: string, reintegrationDate: string) =>
    api.post<ApiStaffMember>(`/staff/former/${id}/reintegrate`, { role, reintegrationDate }),
};

// ─── Mappers (API → frontend legacy types) ────────────────────────────────────

export function mapStaff(m: ApiStaffMember) {
  const initials = `${m.firstName[0] ?? '?'}${m.lastName[0] ?? '?'}`.toUpperCase();
  return {
    apiId:   m.id,
    id:      m.id,
    name:    `${m.firstName} ${m.lastName}`,
    role:    m.role,
    classes: m.classes,
    status:  m.status === 'PRESENT' ? 'present' : m.status === 'ABSENT' ? 'absent' : 'conge' as 'present' | 'absent' | 'conge',
    phone:   m.phone  ?? '—',
    email:   m.email  ?? '—',
    since:   m.since,
    initials,
  };
}

export function mapCandidate(c: ApiCandidate) {
  return {
    apiId:        c.id,
    id:           c.id,
    prenom:       c.firstName,
    nom:          c.lastName,
    posteVise:    c.targetRole ?? '',
    telephone:    c.phone ?? '',
    statut:       (c.status === 'PRESELECTIONNE' ? 'présélectionné' : c.status === 'ENTRETIEN_FAIT' ? 'entretien fait' : 'nouveau') as 'nouveau' | 'présélectionné' | 'entretien fait',
    cvUploaded:   !!c.cvKey,
    dateCandidate: new Date(c.appliedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
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
