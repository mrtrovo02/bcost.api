'use strict';

import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import Joi from 'joi';

// --- Core ---
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';

// --- Infra / Observability ---
import { AppLoggerModule } from './common/logger/logger.module.js';
import { AuditModule as CommonAuditModule } from './common/audit/audit.module.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

// --- Guards / Middleware ---
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { TenantMiddleware } from './common/middlewares/tenant.middleware.js';
import { TenantContextGuard } from './common/guards/tenant-context.guard.js';
import { CompanyAccessGuard } from './common/guards/company-access.guard.js';

// --- Feature Modules ---
import { HealthModule } from './modules/health/health.module.js';
import { NotificationModule } from './modules/notifications/notification.module.js';
import { CompanyModule } from './modules/company/company.module.js';
import { ContractModule } from './modules/contracts/contract.module.js';
import { RevenueModule } from './modules/revenue/revenue.module.js';
import { FiscalModule } from './modules/fiscal/fiscal.module.js';
import { FiscalSimulationModule } from './modules/fiscal-simulation/fiscal-simulation.module.js';
import { BankingModule } from './modules/banking/banking.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { AutomationJobsEnterpriseModule } from './modules/automation/automation-jobs-enterprise.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { BusinessRulesModule } from './modules/business-rules/business-rules.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { AuditModule as ProductAuditModule } from './modules/audit/audit.module.js';
import { EnterpriseModulesModule } from './modules/enterprise/enterprise-modules.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { DigitalCertificatesEnterpriseModule } from './modules/digital-certificates/digital-certificates-enterprise.module.js';
import { ObligationsEnterpriseModule } from './modules/obligations/obligations-enterprise.module.js';
import { AccountingEnterpriseModule } from './modules/accounting/accounting-enterprise.module.js';
import { BankingEnterpriseModule } from './modules/banking-enterprise/banking-enterprise.module.js';
import { PayrollEnterpriseModule } from './modules/payroll-enterprise/payroll-enterprise.module.js';
import { ComplianceEnterpriseModule } from './modules/compliance-enterprise/compliance-enterprise.module.js';
import { NotificationsEnterpriseModule } from './modules/notifications-enterprise/notifications-enterprise.module.js';
import { CommandCenterEnterpriseModule } from './modules/command-center-enterprise/command-center-enterprise.module.js';
import { AuditIntelligenceEnterpriseModule } from './modules/audit-intelligence-enterprise/audit-intelligence-enterprise.module.js';
import { FinanceOperationsEnterpriseModule } from './modules/finance-operations-enterprise/finance-operations-enterprise.module.js';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module.js';

@Module({
  imports: [
    // ⚙️ Validação Rígida do Schema de Ambiente (Joi)
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(5000),
        HOST: Joi.string().default('0.0.0.0'),
        PUBLIC_BASE_URL: Joi.string().uri().optional(),

        DATABASE_URL: Joi.string().required(),

        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').default(''),

        JWT_SECRET: Joi.string().min(32).required(),

        ALLOW_SETUP_ADMIN: Joi.string().valid('true', 'false').default('false'),
        SETUP_ADMIN_PASSWORD: Joi.string().optional(),

        ENABLE_SWAGGER: Joi.string().valid('true', 'false').default('false'),
        CORS_ORIGINS: Joi.string().allow('').default(''),
        METRICS_API_KEY: Joi.string().allow('').default(''),
        LOG_LEVEL: Joi.string()
          .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
          .default('info'),

        CACHE_TTL: Joi.number().default(600),
        THROTTLE_TTL: Joi.number().default(60),
        THROTTLE_LIMIT: Joi.number().default(100),
      }),
    }),

    // 🛡️ Rate Limiting Global
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: (config.get<number>('THROTTLE_TTL') ?? 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
        },
      ],
    }),

    // ⚡ Cache Em Memória
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: config.get<number>('CACHE_TTL') ?? 600,
        max: 1000,
      }),
    }),

    // 🐂 Fila de Processamento Assíncrono (BullMQ + Redis)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          enableOfflineQueue: true,
          lazyConnect: true,
          maxRetriesPerRequest: null,
          connectTimeout: 5000,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
    }),

    // 📢 Eventos Internos
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      global: true,
    }),

    // ⏰ Agendador de Tarefas Crons
    ScheduleModule.forRoot(),

    // --- Core / Infra ---
    AppLoggerModule,
    PrismaModule,
    CommonAuditModule,
    AuthModule,
    HealthModule,

    // --- Product Modules ---
    NotificationModule,
    NotificationsEnterpriseModule,
    CommandCenterEnterpriseModule,
    AuditIntelligenceEnterpriseModule,
    CompanyModule,
    ContractModule,
    RevenueModule,
    FiscalModule,
    FiscalSimulationModule,
    BankingModule,
    ReconciliationModule,
    AutomationModule,
    AutomationJobsEnterpriseModule,
    DashboardModule,
    InsightsModule,
    BusinessRulesModule,
    FinanceModule,
    ProductAuditModule,
    EnterpriseModulesModule,
    BillingModule,
    DigitalCertificatesEnterpriseModule,
    ObligationsEnterpriseModule,
    AccountingEnterpriseModule,
    BankingEnterpriseModule,
    FinanceOperationsEnterpriseModule,
    PayrollEnterpriseModule,
    ComplianceEnterpriseModule,
    ServiceCatalogModule,
  ],

  controllers: [AppController],

  providers: [
    AppService,

    LoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: LoggingInterceptor,
    },

    // 🔒 ORDEM CRÍTICA DE EXECUÇÃO DOS GUARDS GLOBAIS
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: CompanyAccessGuard },

    // 🧪 PIPES GLOBAIS DE VALIDAÇÃO
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: {
            enableImplicitConversion: true,
          },
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
        { path: 'live', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
        { path: 'api/v1', method: RequestMethod.GET },
        { path: 'api/v1/health', method: RequestMethod.GET },
        { path: 'api/v1/diagnostics', method: RequestMethod.GET },
        { path: 'api/v1/auth/(.*)', method: RequestMethod.ALL },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/(.*)', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
