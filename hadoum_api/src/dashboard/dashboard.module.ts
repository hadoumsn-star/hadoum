import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { StaffModule } from '../staff/staff.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Module 6 (PR 20, extended PR 21/22) — dashboard aggregation foundation.
 *
 * Imports only what DashboardService actually injects: FinancesModule
 * (FinancesService — already exported, see FinancesModule's own PR 16
 * comment reusing it for donation Transactions) and StaffModule
 * (StaffService — export added PR 20, see StaffModule's own comment).
 * PrismaService needs no explicit import (PrismaModule is @Global()).
 *
 * PR 21/22's /operations and /attention endpoints (stock/procedures/
 * incidents/tickets/validations/campaigns/donor reports) deliberately do
 * NOT import StockItemsModule, AdministrativeProceduresModule,
 * MaintenanceTicketsModule, IncidentsModule, ValidationsModule, or
 * DonorsModule — none of the counts needed a full service injection (see
 * DashboardService.getOperations/getAttention's own doc comments for the
 * per-domain reasoning), so no new module exports were required. The two
 * PR 22 alert formulas that DO need real centralization
 * (computeProcedureAlerts, computeCampaignAlerts) are plain exported pure
 * functions, imported directly by TS module path — not NestJS providers —
 * so reusing them needs no DI wiring here either.
 */
@Module({
  imports: [FinancesModule, StaffModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
