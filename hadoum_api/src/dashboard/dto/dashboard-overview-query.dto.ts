import { IsIn, IsOptional } from 'class-validator';
import { DASHBOARD_PERIOD_TYPES } from '../dashboard-period.util';
import type { DashboardPeriodType } from '../dashboard-period.util';

export class DashboardOverviewQueryDto {
  // Same @IsOptional() + rejecting-validator convention as every other
  // optional enum-ish query param in this codebase (e.g.
  // QueryCampaignsDto.status) — an invalid value 400s rather than
  // silently falling back to the default, so a typo in the query string
  // is never mistaken for "no preference".
  @IsOptional()
  @IsIn(DASHBOARD_PERIOD_TYPES)
  period?: DashboardPeriodType;
}
