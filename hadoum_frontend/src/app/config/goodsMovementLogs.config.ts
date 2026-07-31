import type { ApiGoodsMovementType, ApiGoodsMovementStatus } from '../services/goodsMovementLogs.api';

export const GOODS_MOVEMENT_TYPE_LABELS: Record<ApiGoodsMovementType, string> = {
  ENTREE_MARCHANDISE: 'Entrée de marchandise',
  SORTIE_MARCHANDISE: 'Sortie de marchandise',
  LIVRAISON:          'Livraison',
  RETOUR_FOURNISSEUR: 'Retour fournisseur',
  PRET_EQUIPEMENT:    "Prêt d'équipement",
  RETOUR_EQUIPEMENT:  "Retour d'équipement",
  TRANSFERT:          'Transfert',
  SORTIE_TEMPORAIRE:  'Sortie temporaire',
  DON_RECU:           'Don reçu',
  DON_DISTRIBUE:      'Don distribué',
  REFORME:            'Réforme',
  AUTRE:              'Autre',
};

export const GOODS_MOVEMENT_TYPE_OPTIONS: ApiGoodsMovementType[] = [
  'ENTREE_MARCHANDISE', 'SORTIE_MARCHANDISE', 'LIVRAISON', 'RETOUR_FOURNISSEUR',
  'PRET_EQUIPEMENT', 'RETOUR_EQUIPEMENT', 'TRANSFERT', 'SORTIE_TEMPORAIRE',
  'DON_RECU', 'DON_DISTRIBUE', 'REFORME', 'AUTRE',
];

export const GOODS_MOVEMENT_STATUS_LABELS: Record<ApiGoodsMovementStatus, string> = {
  ENREGISTRE:            'Enregistré',
  SORTI:                 'Sorti',
  RETOURNE:              'Retourné',
  EN_ATTENTE_VALIDATION: 'En attente de validation',
  ANNULE:                'Annulé',
  ARCHIVE:               'Archivé',
};

export const GOODS_MOVEMENT_STATUS_STYLE: Record<ApiGoodsMovementStatus, { bg: string; color: string }> = {
  ENREGISTRE:            { bg: '#ECFDF5', color: '#065F46' },
  SORTI:                 { bg: '#EEF2F7', color: '#3E5A78' },
  RETOURNE:              { bg: '#F3F4F6', color: '#374151' },
  EN_ATTENTE_VALIDATION: { bg: '#FFFBEB', color: '#D97706' },
  ANNULE:                { bg: '#F3F4F6', color: '#9CA3AF' },
  ARCHIVE:               { bg: '#F3F4F6', color: '#9CA3AF' },
};

export const PENDING_GOODS_ACTION_LABELS: Record<string, string> = {
  HIGH_VALUE_ASSET_EXIT: "Sortie d'un bien de grande valeur",
  TEMPORARY_ASSET_EXIT: "Sortie temporaire d'un bien",
  CONTROLLED_GOODS_EXIT: 'Sortie de marchandise contrôlée',
  RECORD_ARCHIVE: "Archivage de l'enregistrement",
};
