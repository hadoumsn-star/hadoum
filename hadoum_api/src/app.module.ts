import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { ChildrenModule } from './children/children.module';
import { ReportsModule } from './reports/reports.module';
import { StaffModule } from './staff/staff.module';
import { AuthModule } from './auth/auth.module';
import { FinancesModule } from './finances/finances.module';
import { IncidentsModule } from './incidents/incidents.module';
import { SpacesModule } from './spaces/spaces.module';
import { ValidationsModule } from './validations/validations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MaintenanceTicketsModule } from './maintenance-tickets/maintenance-tickets.module';
import { SupplierContractsModule } from './supplier-contracts/supplier-contracts.module';
import { AdministrativeProceduresModule } from './administrative-procedures/administrative-procedures.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { StockItemsModule } from './stock-items/stock-items.module';
import { InventoryAssetsModule } from './inventory-assets/inventory-assets.module';
import { EntryLogsModule } from './entry-logs/entry-logs.module';
import { GoodsMovementLogsModule } from './goods-movement-logs/goods-movement-logs.module';
import { ActivitiesModule } from './activities/activities.module';
import { FundRequestsModule } from './fund-requests/fund-requests.module';
import { ContactsModule } from './contacts/contacts.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditLogInterceptor } from './audit-logs/interceptors/audit-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (req, res) => {
          const header = req.headers['x-request-id'];
          const id =
            (Array.isArray(header) ? header[0] : header) || randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.currentPassword',
            'req.body.newPassword',
            'req.body.token',
          ],
          censor: '[REDACTED]',
        },
        customProps: () => ({ appEnv: process.env.APP_ENV ?? 'unknown' }),
        autoLogging: {
          ignore: (req) =>
            req.url === '/api/health' || req.url === '/api/metrics',
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
      },
    ]),
    HealthModule,
    MetricsModule,
    PrismaModule,
    ChildrenModule,
    ReportsModule,
    StaffModule,
    AuthModule,
    FinancesModule,
    IncidentsModule,
    SpacesModule,
    ValidationsModule,
    NotificationsModule,
    MaintenanceTicketsModule,
    SupplierContractsModule,
    AdministrativeProceduresModule,
    StockMovementsModule,
    StockItemsModule,
    InventoryAssetsModule,
    EntryLogsModule,
    GoodsMovementLogsModule,
    ActivitiesModule,
    FundRequestsModule,
    ContactsModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // PR 13: generic audit trail. Global so every @Audited(...) route across
    // every module is covered from one registration; routes without the
    // decorator are completely unaffected (see AuditLogInterceptor).
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
