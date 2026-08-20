import type { CampaignStatus } from '@prisma/client';

// Module 6 (PR 22) — extracted, unchanged, from CampaignsService.withComputed
// (PR 19). Single authoritative definition of the two campaign alert flags,
// reused by CampaignsService itself (real list/detail responses, unchanged
// behavior) AND by DashboardService's /dashboard/attention, so a second date
// threshold never gets invented at the dashboard layer.

// PR 19: how many days out "ending soon" starts warning — same order of
// magnitude as CONTRACT_EXPIRING_SOON/STOCK_EXPIRING_SOON elsewhere.
export const CAMPAIGN_ENDING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CampaignAlertInput {
  status: CampaignStatus;
  endDate: Date | null;
}

export interface CampaignAlertFlags {
  isEndingSoon: boolean;
  isEndDatePassed: boolean;
}

// Both flags only ever apply to an ACTIVE campaign — a campaign that's
// already TERMINEE/ANNULEE (or BROUILLON with no start yet) is never
// flagged. Neither flag mutates campaign.status; termination stays a
// DIRECTOR action via the existing lifecycle endpoints.
export function computeCampaignAlerts(
  c: CampaignAlertInput,
  now: Date = new Date(),
): CampaignAlertFlags {
  const nowMs = now.getTime();
  const isActive = c.status === 'ACTIVE';
  const endDateMs = c.endDate ? c.endDate.getTime() : null;
  const isEndDatePassed = isActive && endDateMs !== null && endDateMs < nowMs;
  const isEndingSoon =
    isActive &&
    !isEndDatePassed &&
    endDateMs !== null &&
    endDateMs - nowMs <= CAMPAIGN_ENDING_SOON_DAYS * DAY_MS;

  return { isEndingSoon, isEndDatePassed };
}
