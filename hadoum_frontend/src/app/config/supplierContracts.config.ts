import type {
  ApiContractCategory, ApiContractStatus, ApiRenewalType, ApiBillingFrequency,
} from '../services/supplierContracts.api';

export const CONTRACT_CATEGORY_LABELS: Record<ApiContractCategory, string> = {
  BOULANGERIE: 'Boulangerie',
  GAZ:         'Gaz',
  EAU:         'Eau',
  ELECTRICITE: 'Électricité',
  WOYOFAL:     'Woyofal',
  ENTRETIEN:   'Maintenance',
  NETTOYAGE:   'Nettoyage',
  SECURITE:    'Sécurité',
  AUTRE:       'Autre',
};

export const CONTRACT_CATEGORY_OPTIONS: ApiContractCategory[] =
  ['BOULANGERIE', 'GAZ', 'EAU', 'ELECTRICITE', 'WOYOFAL', 'ENTRETIEN', 'NETTOYAGE', 'SECURITE', 'AUTRE'];

export const CONTRACT_STATUS_LABELS: Record<ApiContractStatus, string> = {
  BROUILLON:      'Brouillon',
  ACTIF:          'Actif',
  EXPIRE_BIENTOT: 'Expire bientôt',
  EXPIRE:         'Expiré',
  RESILIE:        'Résilié',
  ARCHIVE:        'Archivé',
};

export const CONTRACT_STATUS_OPTIONS: ApiContractStatus[] =
  ['BROUILLON', 'ACTIF', 'EXPIRE_BIENTOT', 'EXPIRE', 'RESILIE', 'ARCHIVE'];

export const CONTRACT_STATUS_STYLE: Record<ApiContractStatus, { bg: string; color: string }> = {
  BROUILLON:      { bg: '#F3F4F6', color: '#374151' },
  ACTIF:          { bg: '#ECFDF5', color: '#065F46' },
  EXPIRE_BIENTOT: { bg: '#FFFBEB', color: '#D97706' },
  EXPIRE:         { bg: '#FEF2F2', color: '#B91C1C' },
  RESILIE:        { bg: '#F3F4F6', color: '#6B7280' },
  ARCHIVE:        { bg: '#F3F4F6', color: '#9CA3AF' },
};

export const RENEWAL_TYPE_LABELS: Record<ApiRenewalType, string> = {
  AUTOMATIQUE:      'Automatique',
  MANUEL:           'Manuel',
  NON_RENOUVELABLE: 'Non renouvelable',
};

export const RENEWAL_TYPE_OPTIONS: ApiRenewalType[] = ['AUTOMATIQUE', 'MANUEL', 'NON_RENOUVELABLE'];

export const BILLING_FREQUENCY_LABELS: Record<ApiBillingFrequency, string> = {
  MENSUELLE:      'Mensuelle',
  TRIMESTRIELLE:  'Trimestrielle',
  SEMESTRIELLE:   'Semestrielle',
  ANNUELLE:       'Annuelle',
  PONCTUELLE:     'Ponctuelle',
};

export const BILLING_FREQUENCY_OPTIONS: ApiBillingFrequency[] =
  ['MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE', 'PONCTUELLE'];
