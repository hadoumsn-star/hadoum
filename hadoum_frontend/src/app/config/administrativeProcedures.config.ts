import type {
  ApiProcedureType, ApiProcedureStatus, ApiProcedurePriority, ApiProcedureDocumentType,
} from '../services/administrativeProcedures.api';

export const PROCEDURE_TYPE_LABELS: Record<ApiProcedureType, string> = {
  AGREMENT:           'Agrément',
  DECLARATION:        'Déclaration',
  AUTORISATION:       'Autorisation',
  ASSURANCE:          'Assurance',
  CERTIFICAT:         'Certificat',
  DOCUMENT_JURIDIQUE: 'Document juridique',
  RENOUVELLEMENT:     'Renouvellement',
  CONVENTION:         'Convention',
  ATTESTATION:        'Attestation',
  AUTRE:              'Autre',
};

export const PROCEDURE_TYPE_OPTIONS: ApiProcedureType[] = [
  'AGREMENT', 'DECLARATION', 'AUTORISATION', 'ASSURANCE', 'CERTIFICAT',
  'DOCUMENT_JURIDIQUE', 'RENOUVELLEMENT', 'CONVENTION', 'ATTESTATION', 'AUTRE',
];

// EN_ATTENTE_REPONSE carries its 🟠 marker right in the label so every
// place that already renders PROCEDURE_STATUS_LABELS (list, detail modal,
// the Supervisor unified validation list) shows the badge without needing
// its own per-status icon logic.
export const PROCEDURE_STATUS_LABELS: Record<ApiProcedureStatus, string> = {
  A_PREPARER:          'À préparer',
  EN_COURS:            'En cours',
  SOUMIS:              'Soumis',
  EN_ATTENTE_REPONSE:  '🟠 En attente de réponse',
  APPROUVE:            'Approuvé',
  REFUSE:              'Refusé',
  EXPIRE:              'Expiré',
  ARCHIVE:             'Archivé',
};

export const PROCEDURE_STATUS_OPTIONS: ApiProcedureStatus[] =
  ['A_PREPARER', 'EN_COURS', 'SOUMIS', 'EN_ATTENTE_REPONSE', 'APPROUVE', 'REFUSE', 'EXPIRE', 'ARCHIVE'];

// The subset a DIRECTOR can pick directly from the "Statut de suivi" field
// on the create/edit form — pure operational tracking, pre-submission.
// SOUMIS/APPROUVE/REFUSE/EXPIRE/ARCHIVE stay reachable only through the
// validation workflow (Soumettre / Approuver / Refuser / Archiver
// actions) and are deliberately excluded here so this field can never be
// used to bypass that circuit — see AdministrativeProceduresService's
// MANUALLY_SETTABLE_STATUSES for the matching server-side guard.
export const PROCEDURE_MANUAL_STATUS_OPTIONS: ApiProcedureStatus[] =
  ['A_PREPARER', 'EN_COURS', 'EN_ATTENTE_REPONSE'];

export const PROCEDURE_STATUS_STYLE: Record<ApiProcedureStatus, { bg: string; color: string }> = {
  A_PREPARER:         { bg: '#F3F4F6', color: '#374151' },
  EN_COURS:           { bg: '#EEF2F7', color: '#3E5A78' },
  SOUMIS:             { bg: '#FFFBEB', color: '#D97706' },
  EN_ATTENTE_REPONSE: { bg: '#FFF1E9', color: '#C2410C' },
  APPROUVE:           { bg: '#ECFDF5', color: '#065F46' },
  REFUSE:             { bg: '#FEF2F2', color: '#B91C1C' },
  EXPIRE:             { bg: '#FEF2F2', color: '#B91C1C' },
  ARCHIVE:            { bg: '#F3F4F6', color: '#9CA3AF' },
};

export const PROCEDURE_PRIORITY_LABELS: Record<ApiProcedurePriority, string> = {
  BASSE:    'Basse',
  NORMALE:  'Normale',
  HAUTE:    'Haute',
  CRITIQUE: 'Critique',
};

export const PROCEDURE_PRIORITY_OPTIONS: ApiProcedurePriority[] = ['BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE'];

export const PROCEDURE_PRIORITY_STYLE: Record<ApiProcedurePriority, { bg: string; color: string }> = {
  BASSE:    { bg: '#F3F4F6', color: '#6B7280' },
  NORMALE:  { bg: '#EEF2F7', color: '#3E5A78' },
  HAUTE:    { bg: '#FFFBEB', color: '#D97706' },
  CRITIQUE: { bg: '#FEF2F2', color: '#B91C1C' },
};

export const PROCEDURE_DOCUMENT_TYPE_LABELS: Record<ApiProcedureDocumentType, string> = {
  FORMULAIRE:             'Formulaire',
  COURRIER:               'Courrier',
  RECEPISSE:              'Récépissé',
  AGREMENT:               'Agrément',
  AUTORISATION:           'Autorisation',
  ATTESTATION:            'Attestation',
  ASSURANCE:              'Assurance',
  CERTIFICAT:             'Certificat',
  PIECE_JURIDIQUE:        'Pièce juridique',
  REPONSE_ADMINISTRATION: "Réponse de l'administration",
  AUTRE:                  'Autre',
};

export const PROCEDURE_DOCUMENT_TYPE_OPTIONS: ApiProcedureDocumentType[] = [
  'FORMULAIRE', 'COURRIER', 'RECEPISSE', 'AGREMENT', 'AUTORISATION',
  'ATTESTATION', 'ASSURANCE', 'CERTIFICAT', 'PIECE_JURIDIQUE',
  'REPONSE_ADMINISTRATION', 'AUTRE',
];

export const PENDING_PROCEDURE_ACTION_LABELS: Record<string, string> = {
  SUBMISSION: 'Soumission officielle',
  FINALIZATION: 'Approbation / finalisation',
  RENEWAL: 'Renouvellement',
  ARCHIVE: 'Archivage',
};
