export type ApiTransactionCategory =
  | 'ALIMENTATION' | 'SALAIRES' | 'ENTRETIEN' | 'SANTE' | 'PEDAGOGIE' | 'EQUIPEMENT'
  // PR 6 — default monthly budget categories that had no existing match
  // (see hadoum_api schema TransactionCategory / DEFAULT_BUDGET_CATEGORIES).
  | 'VETEMENTS' | 'TRANSPORT' | 'ETUDES' | 'SPORT' | 'LOISIRS' | 'BUREAU_FACTURES'
  | 'DON' | 'VIREMENT' | 'APPORT' | 'AUTRE';

export const CATEGORY_LABELS: Record<ApiTransactionCategory, string> = {
  ALIMENTATION:    'Alimentation',
  SALAIRES:        'Salaires',
  ENTRETIEN:       'Entretien',
  SANTE:           'Santé',
  PEDAGOGIE:       'Pédagogie',
  EQUIPEMENT:      'Équipement',
  VETEMENTS:       'Vêtements',
  TRANSPORT:       'Transport',
  ETUDES:          'Études',
  SPORT:           'Sport',
  LOISIRS:         'Loisirs',
  BUREAU_FACTURES: 'Bureau et factures',
  DON:             'Don',
  VIREMENT:        'Virement',
  APPORT:          'Apport',
  AUTRE:           'Autre',
};

export const CATEGORY_COLORS: Record<ApiTransactionCategory, string> = {
  ALIMENTATION:    '#3E5A78',
  SALAIRES:        '#374151',
  ENTRETIEN:       '#D97706',
  SANTE:           '#065F46',
  PEDAGOGIE:       '#7C3AED',
  EQUIPEMENT:      '#B91C1C',
  VETEMENTS:       '#0E7490',
  TRANSPORT:       '#4D7C0F',
  ETUDES:          '#9333EA',
  SPORT:           '#C2410C',
  LOISIRS:         '#DB2777',
  BUREAU_FACTURES: '#475569',
  DON:             '#065F46',
  VIREMENT:        '#3E5A78',
  APPORT:          '#7C3AED',
  AUTRE:           '#6B7280',
};

// Standardized set for new DEPENSE transactions — exactly these 9. Legacy
// categories no longer offered here (ENTRETIEN, PEDAGOGIE, EQUIPEMENT, AUTRE)
// are deliberately NOT removed from the `ApiTransactionCategory` union, from
// `CATEGORY_LABELS`/`CATEGORY_COLORS`, or from the Prisma enum — existing
// transactions tagged with them must keep displaying and stay editable (see
// TransactionModal's legacy-category handling in FinancesPage).
export const EXPENSE_CATEGORIES: ApiTransactionCategory[] = [
  'ALIMENTATION', 'SANTE', 'VETEMENTS', 'TRANSPORT', 'ETUDES',
  'SPORT', 'LOISIRS', 'BUREAU_FACTURES', 'SALAIRES',
];

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

// PR 5E — expense approval workflow status badge (see finances.api.ts
// ApiExpenseWorkflowStatus). No NULL entry: a null workflow status means
// "not part of the workflow" and renders no badge at all (see FinancesPage).
export type ApiExpenseWorkflowStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export const EXPENSE_WORKFLOW_STATUS_LABELS: Record<ApiExpenseWorkflowStatus, string> = {
  PENDING_APPROVAL: 'En attente de validation',
  APPROVED:         'Approuvée',
  REJECTED:         'Refusée',
  COMPLETED:        'Clôturée',
  CANCELLED:        'Annulée',
};

export const EXPENSE_WORKFLOW_STATUS_STYLE: Record<ApiExpenseWorkflowStatus, { bg: string; color: string }> = {
  PENDING_APPROVAL: { bg: '#FFFBEB', color: '#D97706' },
  APPROVED:         { bg: '#ECFDF5', color: '#065F46' },
  REJECTED:         { bg: '#FEF2F2', color: '#B91C1C' },
  COMPLETED:        { bg: '#EEF2F7', color: '#3E5A78' },
  CANCELLED:        { bg: '#F3F4F6', color: '#374151' },
};

// MOBILE_MONEY kept in the type/labels only for historical transactions —
// see the Prisma schema comment on PaymentMethod. New transactions choose
// WAVE_MOBILE_MONEY or ORANGE_MOBILE_MONEY instead (`PAYMENT_METHODS` below
// is the "new transaction" list and deliberately excludes MOBILE_MONEY).
export type ApiPaymentMethod =
  | 'ESPECES' | 'VIREMENT' | 'CHEQUE' | 'MOBILE_MONEY'
  | 'WAVE_MOBILE_MONEY' | 'ORANGE_MOBILE_MONEY' | 'CARTE' | 'AUTRE';

export const PAYMENT_METHOD_LABELS: Record<ApiPaymentMethod, string> = {
  ESPECES:             'Espèces',
  VIREMENT:            'Virement',
  CHEQUE:              'Chèque',
  MOBILE_MONEY:        'Mobile Money',
  WAVE_MOBILE_MONEY:   'Wave Mobile Money',
  ORANGE_MOBILE_MONEY: 'Orange Mobile Money',
  CARTE:               'Carte',
  AUTRE:               'Autre',
};

export const PAYMENT_METHODS: ApiPaymentMethod[] =
  ['ESPECES', 'VIREMENT', 'CHEQUE', 'WAVE_MOBILE_MONEY', 'ORANGE_MOBILE_MONEY', 'CARTE', 'AUTRE'];

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
