import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewQueryDto } from './dto/dashboard-overview-query.dto';
import { DashboardTrendsQueryDto } from './dto/dashboard-trends-query.dto';

// Module 6 (PR 20). DIRECTOR/SUPERVISOR see the same aggregate shape
// (SUPERVISOR remains read-only at the guard level — there are no
// mutation routes on this controller at all). BOARD is included at the
// class level too: every field DashboardService returns is already an
// aggregate (counts/sums), never a person-level object, so there is no
// separate "safe" BOARD serializer to apply here — the privacy guarantee
// is enforced by construction in DashboardService itself (see its own
// doc comment), not by filtering a richer response per role. EDUCATOR is
// absent, same as every other admin/finance/donor-adjacent module.
//
// No @Audited() anywhere on this controller: the existing
// AuditLogInterceptor only ever acts on mutating HTTP methods (POST/
// PATCH/PUT/DELETE — see its own MUTATING_METHODS set); a GET-only
// controller like this one was already unaudited by every existing
// convention (compare campaigns.controller.ts's own @Get() routes,
// none of which carry @Audited either) — introducing one here would be a
// new convention for a read endpoint, not a reuse of the existing one.
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR', 'SUPERVISOR', 'BOARD')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@Query() query: DashboardOverviewQueryDto) {
    return this.dashboardService.getOverview(query.period);
  }

  // PR 21 — narrower than the class-level role list: operational
  // stock/procedure/incident/ticket/validation counts are DIRECTOR/
  // SUPERVISOR only, per the explicit PR 21 instruction. Method-level
  // @Roles() overrides (not merges with) the class-level one — see
  // RolesGuard's own getAllAndOverride usage — same pattern already used
  // by e.g. ValidationsController's @Get('pending').
  @Get('operations')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getOperations() {
    return this.dashboardService.getOperations();
  }

  // PR 21 — same DIRECTOR/SUPERVISOR/BOARD access as /overview: every
  // field is an aggregate chart series (amounts/counts/labels), never
  // person-level data — no method-level @Roles() override needed.
  @Get('trends')
  getTrends(@Query() query: DashboardTrendsQueryDto) {
    return this.dashboardService.getTrends(query.period);
  }

  // PR 22 — same narrowing as /operations: management attention items are
  // DIRECTOR/SUPERVISOR only. BOARD continues to receive aggregate KPI/
  // trend data only (from /overview and /trends), never operational
  // attention items.
  @Get('attention')
  @Roles('DIRECTOR', 'SUPERVISOR')
  getAttention() {
    return this.dashboardService.getAttention();
  }
}
