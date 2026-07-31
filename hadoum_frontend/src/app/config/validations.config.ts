import type { ApiValidationStatus } from '../services/maintenanceTickets.api';

export const VALIDATION_STATUS_LABELS: Record<ApiValidationStatus, string> = {
  DRAFT:               'Brouillon',
  PENDING_VALIDATION:  'En attente de validation',
  APPROVED:            'Validé',
  REJECTED:            'Refusé',
  CHANGES_REQUESTED:   'Modifications demandées',
};

export const VALIDATION_STATUS_STYLE: Record<ApiValidationStatus, { bg: string; color: string }> = {
  DRAFT:              { bg: '#F3F4F6', color: '#374151' },
  PENDING_VALIDATION: { bg: '#FFFBEB', color: '#D97706' },
  APPROVED:           { bg: '#ECFDF5', color: '#065F46' },
  REJECTED:           { bg: '#FEF2F2', color: '#B91C1C' },
  CHANGES_REQUESTED:  { bg: '#F5F3FF', color: '#7C3AED' },
};
