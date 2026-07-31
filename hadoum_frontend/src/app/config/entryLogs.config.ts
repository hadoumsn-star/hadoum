import type {
  ApiEntryType, ApiVisitorCategory, ApiEntryStatus, ApiRegisterDocumentType,
} from '../services/entryLogs.api';

export const ENTRY_TYPE_LABELS: Record<ApiEntryType, string> = {
  ENTREE:                'Entrée',
  SORTIE:                'Sortie',
  VISITE_PREVUE:         'Visite prévue',
  VISITE_IMPREVUE:       'Visite imprévue',
  SORTIE_TEMPORAIRE:     'Sortie temporaire',
  SORTIE_EXCEPTIONNELLE: 'Sortie exceptionnelle',
  RETOUR:                'Retour',
  PRESTATION:            'Prestation',
  LIVRAISON:             'Livraison',
  AUTRE:                 'Autre',
};

export const ENTRY_TYPE_OPTIONS: ApiEntryType[] = [
  'VISITE_PREVUE', 'VISITE_IMPREVUE', 'ENTREE', 'SORTIE', 'SORTIE_TEMPORAIRE',
  'SORTIE_EXCEPTIONNELLE', 'RETOUR', 'PRESTATION', 'LIVRAISON', 'AUTRE',
];

export const VISITOR_CATEGORY_LABELS: Record<ApiVisitorCategory, string> = {
  PARENT_TUTEUR:  'Parent / tuteur',
  FOURNISSEUR:    'Fournisseur',
  PRESTATAIRE:    'Prestataire',
  MAINTENANCE:    'Maintenance',
  LIVRAISON:      'Livraison',
  PARTENAIRE:     'Partenaire',
  BENEVOLE:       'Bénévole',
  ADMINISTRATION: 'Administration',
  PERSONNEL:      'Personnel',
  VISITEUR:       'Visiteur',
  AUTRE:          'Autre',
};

export const VISITOR_CATEGORY_OPTIONS: ApiVisitorCategory[] = [
  'PARENT_TUTEUR', 'FOURNISSEUR', 'PRESTATAIRE', 'MAINTENANCE', 'LIVRAISON',
  'PARTENAIRE', 'BENEVOLE', 'ADMINISTRATION', 'PERSONNEL', 'VISITEUR', 'AUTRE',
];

export const ENTRY_STATUS_LABELS: Record<ApiEntryStatus, string> = {
  PREVUE:                'Prévue',
  PRESENT:               'Présent',
  SORTI:                 'Sorti',
  ANNULEE:               'Annulée',
  REFUSEE:               'Refusée',
  EN_ATTENTE_VALIDATION: 'En attente de validation',
  ARCHIVEE:              'Archivée',
};

export const ENTRY_STATUS_STYLE: Record<ApiEntryStatus, { bg: string; color: string }> = {
  PREVUE:                { bg: '#F5F3FF', color: '#7C3AED' },
  PRESENT:               { bg: '#ECFDF5', color: '#065F46' },
  SORTI:                 { bg: '#F3F4F6', color: '#374151' },
  ANNULEE:               { bg: '#F3F4F6', color: '#9CA3AF' },
  REFUSEE:               { bg: '#FEF2F2', color: '#B91C1C' },
  EN_ATTENTE_VALIDATION: { bg: '#FFFBEB', color: '#D97706' },
  ARCHIVEE:              { bg: '#F3F4F6', color: '#9CA3AF' },
};

export const REGISTER_DOCUMENT_TYPE_LABELS: Record<ApiRegisterDocumentType, string> = {
  AUTORISATION_ACCES: "Autorisation d'accès",
  PIECE_IDENTITE:      "Pièce d'identité",
  BON_LIVRAISON:       'Bon de livraison',
  BON_SORTIE:          'Bon de sortie',
  PRET_EQUIPEMENT:     "Prêt d'équipement",
  RETOUR_EQUIPEMENT:   "Retour d'équipement",
  RAPPORT_INCIDENT:    "Rapport d'incident",
  DOCUMENT_VEHICULE:   'Document véhicule',
  AUTRE:               'Autre',
};

export const REGISTER_DOCUMENT_TYPE_OPTIONS: ApiRegisterDocumentType[] = [
  'AUTORISATION_ACCES', 'PIECE_IDENTITE', 'BON_LIVRAISON', 'BON_SORTIE', 'PRET_EQUIPEMENT',
  'RETOUR_EQUIPEMENT', 'RAPPORT_INCIDENT', 'DOCUMENT_VEHICULE', 'AUTRE',
];

export const PENDING_ENTRY_ACTION_LABELS: Record<string, string> = {
  EXCEPTIONAL_EXIT: 'Sortie exceptionnelle',
  ACCESS_OVERRIDE: "Passage outre un refus d'accès",
  AFTER_HOURS_ACCESS: 'Accès en dehors des heures autorisées',
  MANUAL_CHECKOUT_OVERRIDE: 'Correction manuelle de sortie',
  RECORD_ARCHIVE: "Archivage de l'enregistrement",
};

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, '0')}`;
}
