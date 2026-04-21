'use strict';

// =============================================================================
// ARQUIVO: src/app.module.ts
// =============================================================================

import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_INTERCEPTOR, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import Joi from 'joi';

// --- Core & Infrastructure ---
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';

// --- Feature Modules ---
import { NotificationModule } from './modules/notifications/notification.module.js';
import { CompanyModule } from './modules/company/company.module.js';
import { ContractModule } from './modules/contracts/contract.module.js';
import { RevenueModule } from './modules/revenue/revenue.module.js';
import { FiscalModule } from './modules/fiscal/fiscal.module.js';
import { BankingModule } from './modules/banking/banking.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { BusinessRulesModule } from './modules/business-rules/business-rules.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';

// --- Global Interceptors, Guards & Middlewares ---
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { TenantMiddleware } from './common/middlewares/tenant.middleware.js';
import { TenantContextGuard } from './common/guards/tenant-context.guard.js';
import { CompanyAccessGuard } from './common/guards/company-access.guard.js';

@Module({
  imports: [
    // 1. Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(5000),
        DATABASE_URL: Joi.string().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').default(''),
        JWT_SECRET: Joi.string().min(32).required(),
        ALLOW_SETUP_ADMIN: Joi.string().valid('true', 'false').default('false'),
        SETUP_ADMIN_PASSWORD: Joi.string().optional(),
        ENABLE_SWAGGER: Joi.string().valid('true', 'false').default('false'),
        CORS_ORIGINS: Joi.string().default(''),
        CACHE_TTL: Joi.number().default(600),
        THROTTLE_TTL: Joi.number().default(60),
        THROTTLE_LIMIT: Joi.number().default(100),
      }),
    }),

    // 2. Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL') ?? 60,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
        },
      ],
    }),

    // 3. Cache — MEMÓRIA PURA, sem Redis no bootstrap
    // FIX: redisStore() bloqueava o NestFactory.create() indefinidamente.
    // Redis é usado pelo BullMQ para filas (conexão lazy, não bloqueia).
    // Cache em memória é suficiente para dev e para o bootstrap em prod.
    CacheModule.register({
      isGlobal: true,
      ttl: 600_000,
      max: 1_000,
    }),

    // 4. BullMQ — filas Redis (conexão lazy, não bloqueia o bootstrap)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const password = config.get<string>('REDIS_PASSWORD');
        return {
          connection: {
            host: config.getOrThrow<string>('REDIS_HOST'),
            port: config.getOrThrow<number>('REDIS_PORT'),
            password: password || undefined,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 0,
            connectTimeout: 5_000,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: true,
          },
        };
      },
    }),

    // 5. Infraestrutura
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,

    // 6. Feature Modules
    NotificationModule,
    CompanyModule,
    ContractModule,
    RevenueModule,
    FiscalModule,
    BankingModule,
    ReconciliationModule,
    AutomationModule,
    DashboardModule,
    InsightsModule,
    BusinessRulesModule,
    FinanceModule,
  ],

  controllers: [AppController],

  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: CompanyAccessGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        errorHttpStatusCode: 422,
      }),
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'api/auth/(.*)', method: RequestMethod.ALL },
        { path: 'api/docs/(.*)', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
