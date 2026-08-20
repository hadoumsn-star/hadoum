import { IsIn, IsOptional } from 'class-validator';
import { DASHBOARD_PERIOD_TYPES } from '../dashboard-period.util';
import type { DashboardPeriodType } from '../dashboard-period.util';

// Same shape/convention as DashboardOverviewQueryDto — kept as a separate
// class (rather than reusing that one) so /overview and /trends can evolve
// independent query surfaces later without one DTO having to serve both.
export class DashboardTrendsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIOD_TYPES)
  period?: DashboardPeriodType;
}
