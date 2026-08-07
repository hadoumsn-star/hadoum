import type { ApiAuditModule } from '../services/auditLogs.api';

export const AUDIT_MODULE_LABELS: Record<ApiAuditModule, string> = {
  FINANCE:                    'Finances',
  CONTACTS:                   'Contacts',
  MAINTENANCE:                'Maintenance',
  ADMINISTRATIVE_PROCEDURES:  'Démarches administratives',
  SUPPLIER_CONTRACTS:         'Contrats fournisseurs',
  STOCK:                      'Stock',
  INCIDENTS:                  'Incidents',
};

export const AUDIT_MODULE_OPTIONS: ApiAuditModule[] = [
  'FINANCE', 'CONTACTS', 'MAINTENANCE', 'ADMINISTRATIVE_PROCEDURES',
  'SUPPLIER_CONTRACTS', 'STOCK', 'INCIDENTS',
];

export const AUDIT_MODULE_STYLE: Record<ApiAuditModule, { bg: string; color: string }> = {
  FINANCE:                   { bg: '#ECFDF5', color: '#065F46' },
  CONTACTS:                  { bg: '#F5F3FF', color: '#7C3AED' },
  MAINTENANCE:               { bg: '#EEF2F7', color: '#3E5A78' },
  ADMINISTRATIVE_PROCEDURES: { bg: '#FFFBEB', color: '#D97706' },
  SUPPLIER_CONTRACTS:        { bg: '#FFF7ED', color: '#C2410C' },
  STOCK:                     { bg: '#F0FDFA', color: '#0F766E' },
  INCIDENTS:                 { bg: '#FEF2F2', color: '#B91C1C' },
};

// Free-form action strings (see AuditedMetadata on the backend) — this is a
// display-label lookup only, not an exhaustive/enforced list: an unknown
// action still renders fine (falls back to the raw string).
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Création', UPDATE: 'Modification', DELETE: 'Suppression',
  UPSERT: 'Création/Mise à jour', ARCHIVE: 'Archivage',
  DEACTIVATE: 'Désactivation', REACTIVATE: 'Réactivation',
  SUBMIT: 'Soumission', SUBMIT_VALIDATION: 'Soumission pour validation',
  APPROVE: 'Approbation', REJECT: 'Refus', RESUBMIT: 'Nouvelle soumission',
  REQUEST_CHANGES: 'Modifications demandées', COMPLETE: 'Complétée',
  CANCEL: 'Annulation', ASSIGN: 'Affectation', CLOSE: 'Clôture',
  REQUEST_RENEWAL: 'Demande de renouvellement',
  REQUEST_ARCHIVE: "Demande d'archivage",
  REQUEST_TERMINATION: 'Demande de résiliation',
  REQUEST_DISPOSAL: 'Demande de mise au rebut',
  TRANSFER: 'Transfert', ENTRY: 'Entrée de stock', EXIT: 'Sortie de stock',
  ADJUSTMENT: 'Ajustement de stock', STATUS_CHANGE: 'Changement de statut',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
