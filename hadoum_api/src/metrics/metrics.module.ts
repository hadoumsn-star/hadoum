import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
