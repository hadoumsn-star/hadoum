import type { ApiTicketUrgency, ApiTicketStatus } from '../services/maintenanceTickets.api';

export const TICKET_URGENCY_LABELS: Record<ApiTicketUrgency, string> = {
  FAIBLE:   'Faible',
  MOYENNE:  'Moyenne',
  ELEVEE:   'Élevée',
  CRITIQUE: 'Critique',
};

export const TICKET_URGENCY_OPTIONS: ApiTicketUrgency[] = ['FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE'];

export const TICKET_URGENCY_STYLE: Record<ApiTicketUrgency, { bg: string; color: string }> = {
  FAIBLE:   { bg: '#F3F4F6', color: '#374151' },
  MOYENNE:  { bg: '#FFFBEB', color: '#D97706' },
  ELEVEE:   { bg: '#FFF1E9', color: '#C2410C' },
  CRITIQUE: { bg: '#FEF2F2', color: '#B91C1C' },
};

export const TICKET_STATUS_LABELS: Record<ApiTicketStatus, string> = {
  OUVERT:     'Ouvert',
  ASSIGNE:    'Assigné',
  EN_COURS:   'En cours',
  EN_ATTENTE: 'En attente',
  RESOLU:     'Résolu',
  FERME:      'Fermé',
  ANNULE:     'Annulé',
};

export const TICKET_STATUS_OPTIONS: ApiTicketStatus[] =
  ['OUVERT', 'ASSIGNE', 'EN_COURS', 'EN_ATTENTE', 'RESOLU', 'FERME', 'ANNULE'];

export const TICKET_STATUS_STYLE: Record<ApiTicketStatus, { bg: string; color: string }> = {
  OUVERT:     { bg: '#EEF2F7', color: '#3E5A78' },
  ASSIGNE:    { bg: '#F5F3FF', color: '#7C3AED' },
  EN_COURS:   { bg: '#FFFBEB', color: '#D97706' },
  EN_ATTENTE: { bg: '#FFFBEB', color: '#D97706' },
  RESOLU:     { bg: '#ECFDF5', color: '#065F46' },
  FERME:      { bg: '#F3F4F6', color: '#6B7280' },
  ANNULE:     { bg: '#F3F4F6', color: '#9CA3AF' },
};
