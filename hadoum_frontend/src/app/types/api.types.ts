// ─── Enums matching backend ───────────────────────────────────────────────────

export type ApiGender = 'MASCULIN' | 'FEMININ';
export type ApiChildStatus = 'ORPHELIN_COMPLET' | 'ORPHELIN_PERE' | 'ORPHELIN_MERE' | 'DEMI_ORPHELIN' | 'ENFANT_EN_DIFFICULTE';
export type ApiSchoolType = 'DAARA' | 'ECOLE_PUBLIQUE' | 'ECOLE_PRIVEE';
export type ApiDocumentType =
  | 'ACTE_NAISSANCE'
  | 'ACTE_DECES'
  | 'PIECE_ID_TUTEUR'
  | 'ACCORD_AEMO'
  | 'CARNET_SANTE'
  | 'CERTIFICAT_PEC'
  | 'AUTORISATION_GOUVERNEMENTALE'
  | 'PHOTO'
  | 'ORDONNANCE'
  | 'BULLETIN_SCOLAIRE'
  | 'LEGAL_DOCUMENT'
  | 'EVALUATION_PSYCHOMOTRICE'
  | 'BILAN_PSYCHOLOGIQUE'
  | 'BILAN_SANTE'
  | 'AUTRE';

// ─── List item (GET /api/children) ───────────────────────────────────────────

export interface ApiChildSummary {
  id: string;
  fileNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: ApiGender;
  status: ApiChildStatus;
  entryDate: string;
  guardianName: string | null;
  guardianPhone: string | null;
  isActive: boolean;
  exitType: string | null;
  exitDate: string | null;
  exitReturnDate: string | null;
  exitReason: string | null;
  exitResponsable: string | null;
  schoolRecord: { currentLevel: string } | null;
  documents: { id: string; type: ApiDocumentType }[];
}

// ─── Full profile (GET /api/children/:id) ────────────────────────────────────

export interface ApiVaccination {
  id: string;
  name: string;
  date: string;
  nextDueDate: string | null;
  notes: string | null;
}

export interface ApiConsultation {
  id: string;
  date: string;
  doctor: string;
  reason: string;
  prescription: string | null;
  documentUrl: string | null;
}

export interface ApiMedicalRecord {
  id: string;
  bloodType: string | null;
  allergies: string | null;
  currentTreatments: string | null;
  vaccinationsText: string | null;
  consultationsText: string | null;
  vaccinations: ApiVaccination[];
  consultations: ApiConsultation[];
}

export interface ApiPsychSession {
  id: string;
  date: string;
  observations: string;
  progress: string | null;
}

export interface ApiPsychRecord {
  id: string;
  initialAssessment: string | null;
  pppObjectives: string | null;
  behavioralEvolution: string | null;
  sessions: ApiPsychSession[];
}

export interface ApiSchoolResult {
  id: string;
  period: string;
  subject: string;
  grade: number | null;
  attendance: string | null;
  teacherNotes: string | null;
  bulletinUrl: string | null;
}

export interface ApiSchoolRecord {
  id: string;
  schoolType: ApiSchoolType;
  schoolName: string;
  currentLevel: string;
  results: ApiSchoolResult[];
}

export interface ApiDailyObservation {
  id: string;
  date: string;
  author: string;
  behavior: string;
  groupIntegration: string | null;
  incidents: string | null;
  notes: string | null;
}

export interface ApiDocument {
  id: string;
  type: ApiDocumentType;
  label: string;
  fileUrl: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ApiEventLog {
  id: string;
  eventType: string;
  summary: string;
  details: string | null;
  author: string | null;
  createdAt: string;
}

export interface ApiChildFull extends ApiChildSummary {
  placeOfBirth: string;
  guardianRelation: string | null;
  emergencyContacts: unknown;
  familyComposition: string | null;
  placementHistory: string | null;
  familyContacts: unknown;
  medicalRecord: ApiMedicalRecord | null;
  psychRecord: ApiPsychRecord | null;
  schoolRecord: ApiSchoolRecord | null;
  dailyObservations: ApiDailyObservation[];
  documents: ApiDocument[];
  eventLogs: ApiEventLog[];
}

// ─── Request payloads ─────────────────────────────────────────────────────────

export interface CreateChildPayload {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  gender: ApiGender;
  entryDate: string;
  status: ApiChildStatus;
  guardianName?: string;
  guardianPhone?: string;
  guardianRelation?: string;
  familyComposition?: string;
}
