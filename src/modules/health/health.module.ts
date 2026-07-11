import { MetricsController } from './metrics.controller';
'use strict';

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { PerformanceAuditService } from './tasks/performance-audit.service.js';
import { ExternalNotifierService } from '../notifications/external-notifier.service.js';
import { NotificationModule } from '../notifications/notification.module.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { CompanyCacheInterceptor } from '../../common/interceptors/company-cache.interceptor.js';

@Module({
  imports: [
    TerminusModule,
    PrismaModule,
    NotificationModule,
    ScheduleModule.forRoot(),
    CacheModule.register({
      ttl: 300000,
      max: 1000,
    }),
  ],
  controllers: [MetricsController, HealthController],
  providers: [
    HealthService,
    PerformanceAuditService,
    ExternalNotifierService,
    CompanyCacheInterceptor,
  ],
  exports: [HealthService],
})
export class HealthModule {} // ✅ O nome da classe deve ser exatamente este.
