import type {
  ApiStockCategory, ApiStockUnit, ApiStockMovementType, ApiStockDocumentType,
} from '../services/stockItems.api';

export const STOCK_CATEGORY_LABELS: Record<ApiStockCategory, string> = {
  ALIMENTAIRE:            'Alimentaire',
  HYGIENE:                'Hygiène',
  ENTRETIEN:              'Entretien',
  MEDICAL:                'Médical',
  BUREAU:                 'Fournitures de bureau',
  FOURNITURES_SCOLAIRES:  'Fournitures scolaires',
  VETEMENTS:              'Vêtements',
  LITERIE:                'Literie',
  MOBILIER:               'Mobilier',
  EQUIPEMENT:             'Équipement',
  INFORMATIQUE:           'Informatique',
  OUTILLAGE:              'Outillage',
  DON:                    'Don',
  AUTRE:                  'Autre',
};

export const STOCK_CATEGORY_OPTIONS: ApiStockCategory[] = [
  'ALIMENTAIRE', 'HYGIENE', 'ENTRETIEN', 'MEDICAL', 'BUREAU', 'FOURNITURES_SCOLAIRES',
  'VETEMENTS', 'LITERIE', 'MOBILIER', 'EQUIPEMENT', 'INFORMATIQUE', 'OUTILLAGE', 'DON', 'AUTRE',
];

export const STOCK_UNIT_LABELS: Record<ApiStockUnit, string> = {
  UNITE:      'Unité',
  CARTON:     'Carton',
  PAQUET:     'Paquet',
  KILOGRAMME: 'Kilogramme',
  GRAMME:     'Gramme',
  LITRE:      'Litre',
  MILLILITRE: 'Millilitre',
  BOITE:      'Boîte',
  SAC:        'Sac',
  BOUTEILLE:  'Bouteille',
  ROULEAU:    'Rouleau',
  LOT:        'Lot',
  AUTRE:      'Autre',
};

export const STOCK_UNIT_OPTIONS: ApiStockUnit[] = [
  'UNITE', 'CARTON', 'PAQUET', 'KILOGRAMME', 'GRAMME', 'LITRE', 'MILLILITRE',
  'BOITE', 'SAC', 'BOUTEILLE', 'ROULEAU', 'LOT', 'AUTRE',
];

export const STOCK_MOVEMENT_TYPE_LABELS: Record<ApiStockMovementType, string> = {
  ENTREE:                 'Entrée',
  SORTIE:                 'Sortie',
  AJUSTEMENT_POSITIF:     'Ajustement positif',
  AJUSTEMENT_NEGATIF:     'Ajustement négatif',
  TRANSFERT:              'Transfert',
  PERTE:                  'Perte',
  CASSE:                  'Casse',
  PEREMPTION:             'Péremption',
  DON_RECU:               'Don reçu',
  DON_DISTRIBUE:          'Don distribué',
  RETOUR:                 'Retour',
  INVENTAIRE_CORRECTION:  'Correction d\'inventaire',
};

export const STOCK_MOVEMENT_TYPE_STYLE: Record<ApiStockMovementType, { bg: string; color: string }> = {
  ENTREE:                { bg: '#ECFDF5', color: '#065F46' },
  SORTIE:                { bg: '#EEF2F7', color: '#3E5A78' },
  AJUSTEMENT_POSITIF:    { bg: '#ECFDF5', color: '#065F46' },
  AJUSTEMENT_NEGATIF:    { bg: '#FFFBEB', color: '#D97706' },
  TRANSFERT:             { bg: '#F5F3FF', color: '#7C3AED' },
  PERTE:                 { bg: '#FEF2F2', color: '#B91C1C' },
  CASSE:                 { bg: '#FEF2F2', color: '#B91C1C' },
  PEREMPTION:            { bg: '#FEF2F2', color: '#B91C1C' },
  DON_RECU:              { bg: '#ECFDF5', color: '#065F46' },
  DON_DISTRIBUE:         { bg: '#EEF2F7', color: '#3E5A78' },
  RETOUR:                { bg: '#ECFDF5', color: '#065F46' },
  INVENTAIRE_CORRECTION: { bg: '#FFFBEB', color: '#D97706' },
};

export const STOCK_DOCUMENT_TYPE_LABELS: Record<ApiStockDocumentType, string> = {
  FACTURE:        'Facture',
  BON_LIVRAISON:  'Bon de livraison',
  BON_SORTIE:     'Bon de sortie',
  DON:            'Don',
  INVENTAIRE:     'Inventaire',
  TRANSFERT:      'Transfert',
  REFORME:        'Réforme',
  PERTE:          'Perte',
  VOL:            'Vol',
  GARANTIE:       'Garantie',
  PHOTO:          'Photo',
  AUTRE:          'Autre',
};

export const STOCK_DOCUMENT_TYPE_OPTIONS: ApiStockDocumentType[] = [
  'FACTURE', 'BON_LIVRAISON', 'BON_SORTIE', 'DON', 'INVENTAIRE', 'TRANSFERT',
  'REFORME', 'PERTE', 'VOL', 'GARANTIE', 'PHOTO', 'AUTRE',
];

export const PENDING_STOCK_ACTION_LABELS: Record<string, string> = {
  LARGE_STOCK_EXIT: 'Sortie de stock importante',
  NEGATIVE_ADJUSTMENT: 'Ajustement négatif',
  STOCK_LOSS: 'Perte / casse',
  INVENTORY_CORRECTION: "Correction d'inventaire",
  STOCK_ITEM_ARCHIVE: "Archivage de l'article",
};

export function formatXof(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}
