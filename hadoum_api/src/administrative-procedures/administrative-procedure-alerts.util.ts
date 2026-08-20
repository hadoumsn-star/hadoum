import type { ProcedureStatus } from '@prisma/client';
import {
  PROCEDURE_EXPIRATION_WARNING_DAYS,
  PROCEDURE_RENEWAL_WARNING_DAYS,
} from './administrative-procedures.constants';

// Module 6 (PR 22) — extracted, unchanged, from
// AdministrativeProceduresService.withComputedFields/isExpired/
// effectiveStatus (previously private, inline). This is now the single
// authoritative definition of a procedure's deadline-driven alert flags,
// reused by AdministrativeProceduresService itself (real CRUD/list
// responses, unchanged behavior) AND by DashboardService, so
// /dashboard/operations and /dashboard/attention can never silently
// disagree with each other or with the Administration page's own alert
// badges — see this file's own `requiresAttention` doc comment below for
// exactly what PR 21 got wrong and PR 22 corrects.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProcedureAlertInput {
  status: ProcedureStatus;
  expirationDate: Date | null;
  renewalDate: Date | null;
  expectedResponseDate: Date | null;
}

export interface ProcedureAlertFlags {
  effectiveStatus: ProcedureStatus;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isRenewalDueSoon: boolean;
  isResponseOverdue: boolean;
  daysUntilExpiration: number | null;
  daysUntilRenewal: number | null;
  daysWaitingForResponse: number | null;
  // PR 22 — the authoritative "requiring attention" union, matching
  // AdministrativeProceduresService.urgencyRank's own rank-0/rank-1
  // grouping (everything below the terminal ARCHIVE rank 1000 and the
  // "nothing due" rank 2): isExpired/isResponseOverdue are the urgent
  // half, isExpiringSoon/isRenewalDueSoon are the "plan ahead" half.
  // PR 21's dashboard.operations.proceduresRequiringAttentionCount only
  // covered isExpiringSoon — narrower than this real definition, and is
  // corrected in PR 22 to use this union instead (see DashboardService).
  requiresAttention: boolean;
}

function daysUntil(target: Date, from: Date): number {
  return Math.ceil((target.getTime() - from.getTime()) / DAY_MS);
}

export function computeProcedureAlerts(
  p: ProcedureAlertInput,
  now: Date = new Date(),
): ProcedureAlertFlags {
  const isArchived = p.status === 'ARCHIVE';
  const isExpired =
    !isArchived && p.expirationDate !== null && p.expirationDate < now;
  const effectiveStatus: ProcedureStatus = isArchived
    ? p.status
    : isExpired
      ? 'EXPIRE'
      : p.status;

  const daysUntilExpiration = p.expirationDate
    ? daysUntil(p.expirationDate, now)
    : null;
  const daysUntilRenewal = p.renewalDate ? daysUntil(p.renewalDate, now) : null;
  const daysWaitingForResponse = p.expectedResponseDate
    ? daysUntil(now, p.expectedResponseDate)
    : null;

  const isExpiringSoon =
    !isArchived &&
    !isExpired &&
    daysUntilExpiration !== null &&
    daysUntilExpiration <= PROCEDURE_EXPIRATION_WARNING_DAYS;

  const isRenewalDueSoon =
    !isArchived &&
    daysUntilRenewal !== null &&
    daysUntilRenewal <= PROCEDURE_RENEWAL_WARNING_DAYS;

  const isResponseOverdue =
    !isArchived &&
    p.status === 'EN_ATTENTE_REPONSE' &&
    p.expectedResponseDate !== null &&
    p.expectedResponseDate < now;

  return {
    effectiveStatus,
    isExpired,
    isExpiringSoon,
    isRenewalDueSoon,
    isResponseOverdue,
    daysUntilExpiration,
    daysUntilRenewal,
    daysWaitingForResponse,
    requiresAttention:
      isExpired || isResponseOverdue || isExpiringSoon || isRenewalDueSoon,
  };
}
