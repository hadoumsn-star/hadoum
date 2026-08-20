import type { ApiDonorType } from '../services/donorProfiles.api';
import type { ApiCampaignStatus } from '../services/campaigns.api';
import type { ApiDonorReportPeriodType, ApiDonorReportStatus } from '../services/donorReports.api';
import type { ApiCommunicationType, ApiCommunicationDirection } from '../services/communications.api';

// French, user-facing labels for every Module 5 enum — never render a raw
// enum value (PARRAIN, BROUILLON, ...) in the UI. See the PR 18 plan's
// "French enum/label mapping" table.

export const DONOR_TYPE_LABELS: Record<ApiDonorType, string> = {
  PARRAIN: 'Parrain',
  DONATEUR_PONCTUEL: 'Donateur ponctuel',
};

export const CAMPAIGN_STATUS_LABELS: Record<ApiCampaignStatus, string> = {
  BROUILLON: 'Brouillon',
  ACTIVE: 'Active',
  TERMINEE: 'Terminée',
  ANNULEE: 'Annulée',
};

export const CAMPAIGN_STATUS_STYLE: Record<ApiCampaignStatus, { bg: string; color: string }> = {
  BROUILLON: { bg: '#F3F4F6', color: '#374151' },
  ACTIVE: { bg: '#ECFDF5', color: '#065F46' },
  TERMINEE: { bg: '#EEF2F7', color: '#3E5A78' },
  ANNULEE: { bg: '#FEF2F2', color: '#B91C1C' },
};

export const PERIOD_TYPE_LABELS: Record<ApiDonorReportPeriodType, string> = {
  MENSUEL: 'Mensuel',
  TRIMESTRIEL: 'Trimestriel',
};

export const REPORT_STATUS_LABELS: Record<ApiDonorReportStatus, string> = {
  DRAFT: 'Brouillon',
  GENERATED: 'Généré',
  SENT: 'Envoyé',
};

export const REPORT_STATUS_STYLE: Record<ApiDonorReportStatus, { bg: string; color: string }> = {
  DRAFT: { bg: '#F3F4F6', color: '#374151' },
  GENERATED: { bg: '#FFFBEB', color: '#D97706' },
  SENT: { bg: '#ECFDF5', color: '#065F46' },
};

export const COMMUNICATION_TYPE_LABELS: Record<ApiCommunicationType, string> = {
  REPORT_SENT: 'Rapport envoyé',
  MESSAGE_SENT: 'Message envoyé',
  MESSAGE_RECEIVED: 'Message reçu',
  ACKNOWLEDGEMENT: 'Accusé de réception',
};

export const COMMUNICATION_TYPE_OPTIONS: ApiCommunicationType[] =
  ['MESSAGE_SENT', 'MESSAGE_RECEIVED', 'ACKNOWLEDGEMENT', 'REPORT_SENT'];

export const COMMUNICATION_DIRECTION_LABELS: Record<ApiCommunicationDirection, string> = {
  OUTGOING: 'Sortant',
  INCOMING: 'Entrant',
};
