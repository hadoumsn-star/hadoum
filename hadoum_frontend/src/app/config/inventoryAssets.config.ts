import type { ApiAssetCondition, ApiAssetStatus, ApiAssetDisposalType } from '../services/inventoryAssets.api';

export const ASSET_CONDITION_LABELS: Record<ApiAssetCondition, string> = {
  NEUF:         'Neuf',
  BON:          'Bon',
  MOYEN:        'Moyen',
  MAUVAIS:      'Mauvais',
  HORS_SERVICE: 'Hors service',
};

export const ASSET_CONDITION_OPTIONS: ApiAssetCondition[] = ['NEUF', 'BON', 'MOYEN', 'MAUVAIS', 'HORS_SERVICE'];

export const ASSET_STATUS_LABELS: Record<ApiAssetStatus, string> = {
  DISPONIBLE:    'Disponible',
  AFFECTE:       'Affecté',
  EN_MAINTENANCE:'En maintenance',
  PERDU:         'Perdu',
  VOLE:          'Volé',
  CASSE:         'Cassé',
  REFORME:       'Réformé',
  ARCHIVE:       'Archivé',
};

export const ASSET_STATUS_STYLE: Record<ApiAssetStatus, { bg: string; color: string }> = {
  DISPONIBLE:     { bg: '#ECFDF5', color: '#065F46' },
  AFFECTE:        { bg: '#EEF2F7', color: '#3E5A78' },
  EN_MAINTENANCE: { bg: '#FFFBEB', color: '#D97706' },
  PERDU:          { bg: '#FEF2F2', color: '#B91C1C' },
  VOLE:           { bg: '#FEF2F2', color: '#B91C1C' },
  CASSE:          { bg: '#FEF2F2', color: '#B91C1C' },
  REFORME:        { bg: '#F3F4F6', color: '#6B7280' },
  ARCHIVE:        { bg: '#F3F4F6', color: '#9CA3AF' },
};

export const ASSET_DISPOSAL_TYPE_LABELS: Record<ApiAssetDisposalType, string> = {
  PERTE:   'Perte',
  VOL:     'Vol',
  CASSE:   'Casse',
  REFORME: 'Réforme',
};

export const ASSET_DISPOSAL_TYPE_OPTIONS: ApiAssetDisposalType[] = ['PERTE', 'VOL', 'CASSE', 'REFORME'];

export const PENDING_ASSET_ACTION_LABELS: Record<string, string> = {
  ASSET_TRANSFER: 'Transfert du bien',
  ASSET_DISPOSAL: 'Réforme / perte / casse / vol',
  ASSET_ARCHIVE: 'Archivage du bien',
};
