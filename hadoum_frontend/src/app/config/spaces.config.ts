import type { ApiSpaceCondition, ApiSpaceType } from '../services/spaces.api';

export const SPACE_TYPE_LABELS: Record<ApiSpaceType, string> = {
  SALLE_CLASSE:     'Salle de classe',
  DORTOIR:          'Dortoir',
  CUISINE:          'Cuisine',
  SANITAIRE:        'Sanitaire',
  BUREAU:           'Bureau',
  INFIRMERIE:       'Infirmerie',
  STOCKAGE:         'Stockage',
  ESPACE_EXTERIEUR: 'Espace extérieur',
  AUTRE:            'Autre',
};

export const SPACE_TYPE_OPTIONS: ApiSpaceType[] = [
  'SALLE_CLASSE', 'DORTOIR', 'CUISINE', 'SANITAIRE', 'BUREAU',
  'INFIRMERIE', 'STOCKAGE', 'ESPACE_EXTERIEUR', 'AUTRE',
];

export const SPACE_CONDITION_LABELS: Record<ApiSpaceCondition, string> = {
  BON:          'Bon',
  MOYEN:        'Moyen',
  MAUVAIS:      'Mauvais',
  HORS_SERVICE: 'Hors service',
};

export const SPACE_CONDITION_OPTIONS: ApiSpaceCondition[] = ['BON', 'MOYEN', 'MAUVAIS', 'HORS_SERVICE'];

export const SPACE_CONDITION_STYLE: Record<ApiSpaceCondition, { bg: string; color: string }> = {
  BON:          { bg: '#ECFDF5', color: '#065F46' },
  MOYEN:        { bg: '#FFFBEB', color: '#D97706' },
  MAUVAIS:      { bg: '#FEF2F2', color: '#B91C1C' },
  HORS_SERVICE: { bg: '#F3F4F6', color: '#374151' },
};
