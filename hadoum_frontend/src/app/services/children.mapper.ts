import type { Child } from '../data/mockData';
import type { ApiChildSummary, ApiChildFull, ApiGender, ApiChildStatus, ApiDocumentType, CreateChildPayload } from '../types/api.types';
import { isDossierComplet, isDossierEnrichi } from '../config/documents.config';

// ─── Backend → Frontend ───────────────────────────────────────────────────────

function mapGender(g: ApiGender): 'M' | 'F' {
  return g === 'MASCULIN' ? 'M' : 'F';
}

function mapStatus(s: ApiChildStatus): string {
  const map: Record<ApiChildStatus, string> = {
    ORPHELIN_COMPLET:     'Orphelin complet',
    ORPHELIN_PERE:        'Orphelin de père',
    ORPHELIN_MERE:        'Orphelin de mère',
    DEMI_ORPHELIN:        'Demi-orphelin',
    ENFANT_EN_DIFFICULTE: 'Enfant en difficulté',
  };
  return map[s];
}

const LEVEL_MAP: Record<string, Child['classe']> = {
  'Maternelle': 'Maternelle',
  'Primaire 1': 'Primaire 1',
  'Primaire 2': 'Primaire 2',
  'Primaire 3': 'Primaire 3',
  'Collège':    'Collège',
};

function mapLevel(level: string | null | undefined): Child['classe'] {
  return (level && LEVEL_MAP[level]) ? LEVEL_MAP[level] : 'Primaire 1';
}

// Stable numeric id from UUID (for avatar palette + legacy Record<number, CRM>)
function uuidToNum(uuid: string): number {
  return Math.abs(uuid.split('-').join('').slice(0, 8).split('').reduce((a, c) => a + c.charCodeAt(0), 0));
}

export function mapSummaryToChild(api: ApiChildSummary): Child & { apiId: string } {
  return {
    apiId:           api.id,
    id:              uuidToNum(api.id),
    fileNumber:      api.fileNumber,
    firstName:       api.firstName,
    lastName:        api.lastName,
    dob:             api.dateOfBirth.split('T')[0],
    gender:          mapGender(api.gender),
    classe:          mapLevel(api.schoolRecord?.currentLevel),
    attendanceStatus:'present',
    dossierStatus:   (() => {
      const types = (api.documents ?? []).map(d => d.type as ApiDocumentType);
      if (!isDossierComplet(types)) return 'incomplet';
      if (!isDossierEnrichi(types)) return 'à compléter';
      return 'complet';
    })(),
    tuteurName:      api.guardianName  ?? '',
    tuteurPhone:     api.guardianPhone ?? '',
    admissionDate:   api.entryDate.split('T')[0],
    childStatus:     api.status,
    exitStatus:      (api.isActive === false) ? 'sorti' : 'actif',
    exitType:        (api.exitType as 'temporaire' | 'définitive' | undefined) ?? undefined,
    exitDate:        api.exitDate?.split('T')[0],
    exitReturnDate:  api.exitReturnDate?.split('T')[0],
    exitMotif:       api.exitReason ?? undefined,
    exitResponsable: api.exitResponsable ?? undefined,
  };
}

export function mapFullToChild(api: ApiChildFull): Child & { apiId: string } {
  const base = mapSummaryToChild(api);
  return {
    ...base,
    classe:       mapLevel(api.schoolRecord?.currentLevel),
    tuteurName:   api.guardianName  ?? '',
    tuteurPhone:  api.guardianPhone ?? '',
  };
}

// ─── Frontend → Backend ───────────────────────────────────────────────────────

export function mapFormToPayload(
  form: Omit<Child, 'id'> & { placeOfBirth?: string; childStatus?: ApiChildStatus },
): CreateChildPayload {
  return {
    firstName:    form.firstName,
    lastName:     form.lastName,
    dateOfBirth:  form.dob,
    placeOfBirth: form.placeOfBirth ?? 'Dakar',
    gender:       form.gender === 'M' ? 'MASCULIN' : 'FEMININ',
    entryDate:    form.admissionDate,
    status:       form.childStatus ?? 'ORPHELIN_COMPLET',
    guardianName:  form.tuteurName  || undefined,
    guardianPhone: form.tuteurPhone || undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export { mapGender, mapStatus, uuidToNum };
