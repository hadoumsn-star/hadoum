export type ApiTransactionCategory =
  | 'ALIMENTATION' | 'SALAIRES' | 'ENTRETIEN' | 'SANTE' | 'PEDAGOGIE' | 'EQUIPEMENT'
  | 'DON' | 'VIREMENT' | 'APPORT' | 'AUTRE';

export const CATEGORY_LABELS: Record<ApiTransactionCategory, string> = {
  ALIMENTATION: 'Alimentation',
  SALAIRES:     'Salaires',
  ENTRETIEN:    'Entretien',
  SANTE:        'Santé',
  PEDAGOGIE:    'Pédagogie',
  EQUIPEMENT:   'Équipement',
  DON:          'Don',
  VIREMENT:     'Virement',
  APPORT:       'Apport',
  AUTRE:        'Autre',
};

export const CATEGORY_COLORS: Record<ApiTransactionCategory, string> = {
  ALIMENTATION: '#3E5A78',
  SALAIRES:     '#374151',
  ENTRETIEN:    '#D97706',
  SANTE:        '#065F46',
  PEDAGOGIE:    '#7C3AED',
  EQUIPEMENT:   '#B91C1C',
  DON:          '#065F46',
  VIREMENT:     '#3E5A78',
  APPORT:       '#7C3AED',
  AUTRE:        '#6B7280',
};

export const EXPENSE_CATEGORIES: ApiTransactionCategory[] =
  ['ALIMENTATION', 'SALAIRES', 'ENTRETIEN', 'SANTE', 'PEDAGOGIE', 'EQUIPEMENT', 'AUTRE'];

export const INCOME_CATEGORIES: ApiTransactionCategory[] =
  ['DON', 'VIREMENT', 'APPORT', 'AUTRE'];

export type ApiTransactionStatus = 'VALIDE' | 'EN_ATTENTE';

export const STATUS_LABELS: Record<ApiTransactionStatus, string> = {
  VALIDE:     'Validé',
  EN_ATTENTE: 'En attente',
};

export const STATUS_STYLE: Record<ApiTransactionStatus, { bg: string; color: string }> = {
  VALIDE:     { bg: '#ECFDF5', color: '#065F46' },
  EN_ATTENTE: { bg: '#FFFBEB', color: '#D97706' },
};

const XOF_PER_EUR = 655.957;

export function formatXof(n: number): string {
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

export function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function xofToEur(n: number): number {
  return Math.round((n / XOF_PER_EUR) * 100) / 100;
}
