import type { ApiIncident, ApiIncidentType, ApiIncidentStatus, ApiIncidentPriority } from '../services/incidents.api';

// ─── Category (ApiIncidentType) ─────────────────────────────────────────────
// "Category" in the product language — the field is still called `type` in
// the API/DB (pre-existing), just relabeled here. SECURITE is PR 11's
// addition; category management (add/edit/remove categories) is out of scope
// for this PR, so this stays a fixed list.

export const INCIDENT_CATEGORY_LABELS: Record<ApiIncidentType, string> = {
  MEDICAL:      'Médical',
  COMPORTEMENT: 'Comportement',
  SCOLAIRE:     'Scolaire',
  LOGISTIQUE:   'Logistique',
  SECURITE:     'Sécurité',
  AUTRE:        'Autre',
};

export const INCIDENT_CATEGORY_OPTIONS: ApiIncidentType[] =
  ['MEDICAL', 'COMPORTEMENT', 'SCOLAIRE', 'LOGISTIQUE', 'SECURITE', 'AUTRE'];

// ─── Status ──────────────────────────────────────────────────────────────────
// PR 11 workflow: EN_COURS / EN_ATTENTE / RESOLU. PLANIFIE and EN_RETARD are
// legacy-only — kept here so old incidents still render a label/color, but
// deliberately excluded from SELECTABLE_STATUSES (never offered when
// creating an incident or changing status).

export const INCIDENT_STATUS_LABELS: Record<ApiIncidentStatus, string> = {
  EN_COURS:   'En cours',
  EN_ATTENTE: 'En attente',
  RESOLU:     'Résolu',
  PLANIFIE:   'Planifié (ancien statut)',
  EN_RETARD:  'En retard (ancien statut)',
};

export const INCIDENT_STATUS_STYLE: Record<ApiIncidentStatus, { bg: string; color: string }> = {
  EN_COURS:   { bg: '#EEF2F7', color: '#3E5A78' },
  EN_ATTENTE: { bg: '#FFFBEB', color: '#D97706' },
  RESOLU:     { bg: '#ECFDF5', color: '#065F46' },
  PLANIFIE:   { bg: '#F3F4F6', color: '#6B7280' },
  EN_RETARD:  { bg: '#FEF2F2', color: '#B91C1C' },
};

export const SELECTABLE_INCIDENT_STATUSES: ApiIncidentStatus[] = ['EN_COURS', 'EN_ATTENTE', 'RESOLU'];

export const LEGACY_INCIDENT_STATUSES: ApiIncidentStatus[] = ['PLANIFIE', 'EN_RETARD'];

// ─── Priority ────────────────────────────────────────────────────────────────

export const INCIDENT_PRIORITY_LABELS: Record<ApiIncidentPriority, string> = {
  N1: 'N1 — À traiter aujourd’hui',
  N2: 'N2 — À traiter sous 3 jours',
  N3: 'N3 — Suivi normal',
};

export const INCIDENT_PRIORITY_BADGE_LABELS: Record<ApiIncidentPriority, string> = {
  N1: 'N1',
  N2: 'N2',
  N3: 'N3',
};

export const INCIDENT_PRIORITY_STYLE: Record<ApiIncidentPriority, { bg: string; color: string }> = {
  N1: { bg: '#FEF2F2', color: '#B91C1C' },
  N2: { bg: '#FFFBEB', color: '#D97706' },
  N3: { bg: '#F3F4F6', color: '#374151' },
};

export const INCIDENT_PRIORITY_OPTIONS: ApiIncidentPriority[] = ['N1', 'N2', 'N3'];

// ─── Display helpers (pure, no side effects — same "small compute helper
// living in a config file" precedent as formatXof in financeCategories.
// config.ts) ──────────────────────────────────────────────────────────────

// "N enfant(s) · N membre(s) du personnel · N local/locaux" — same wording
// IncidentsPage's own list card already builds inline; extracted here so
// the Director Dashboard's "Demandes à traiter" section can reuse the
// exact same summary without duplicating the pluralization logic.
export function incidentConcernedSummary(
  incident: Pick<ApiIncident, 'children' | 'staffLinks' | 'spaces'>,
): string {
  return [
    incident.children.length > 0 && `${incident.children.length} enfant${incident.children.length > 1 ? 's' : ''}`,
    incident.staffLinks.length > 0 && `${incident.staffLinks.length} membre${incident.staffLinks.length > 1 ? 's' : ''} du personnel`,
    incident.spaces.length > 0 && `${incident.spaces.length} local${incident.spaces.length > 1 ? 'ux' : ''}`,
  ].filter(Boolean).join(' · ');
}
