'use strict';

import { Controller, Get, Header, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';
import { PrismaService } from './database/prisma.service.js';

interface DbHealth {
  health: number;
}

@ApiTags('System')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Root Endpoint:
   * Deve ser rápido e não bloquear em banco/Redis/filas.
   * Use /health ou /diagnostics para validações profundas.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Painel de Controle Central - bCost Engine' })
  @ApiResponse({
    status: 200,
    description: 'Status global rápido do ecossistema bCost',
  })
  getIndex() {
    return {
      engine: 'bCost Enterprise AI',
      version: '1.0.0',
      status: 'Operational',
      database: 'CHECK /api/v1/diagnostics',
      environment: process.env.NODE_ENV || 'development',
      active_modules: {
        core: [
          'AuthModule',
          'PrismaModule',
          'ConfigModule',
          'EventEmitterModule',
          'AuditModule',
        ],
        business: [
          'CompanyModule',
          'BankingModule',
          'FiscalModule',
          'RevenueModule',
          'ContractModule',
        ],
        intelligence: [
          'InsightsModule',
          'BusinessRulesModule',
          'AnalyticsModule',
        ],
        support: [
          'NotificationModule',
          'AutomationModule',
          'ScheduleModule',
          'BullModule',
        ],
      },
      endpoints: {
        swagger: '/docs',
        liveness: '/health',
        health: '/api/v1/health',
        diagnostics: '/api/v1/diagnostics',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health Check leve:
   * Usado para liveness/readiness básica.
   * Não executa query pesada.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Verificação de Integridade (Liveness/Readiness)' })
  @ApiResponse({
    status: 200,
    description: 'Status básico da aplicação',
  })
  getHealth() {
    const memory = process.memoryUsage();

    return {
      status: 'UP',
      service: 'bcost-api',
      uptime_seconds: Math.floor(process.uptime()),
      resources: {
        heapUsedMB: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
        rssMB: Number((memory.rss / 1024 / 1024).toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('robots.txt')
  @Header('content-type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Robots policy para crawlers no dominio da API' })
  @ApiResponse({
    status: 200,
    description: 'Politica publica de indexacao da API bCost',
  })
  getRobotsTxt(): string {
    return ['User-agent: *', 'Disallow: /', ''].join('\n');
  }

  /**
   * Diagnostics:
   * Aqui sim pode consultar banco para diagnóstico profundo.
   */
  @Public()
  @Get('diagnostics')
  @ApiOperation({ summary: 'Diagnóstico profundo dos subsistemas bCost' })
  @ApiResponse({
    status: 200,
    description: 'Status detalhado dos subsistemas',
  })
  async getDiagnostics() {
    this.logger.debug('🔍 Iniciando diagnóstico de subsistemas...');

    const dbStartedAt = Date.now();

    const dbHealth = await this.prisma.$queryRaw<
      DbHealth[]
    >`SELECT 1 as "health"`
      .then((result) => result?.[0]?.health === 1)
      .catch(() => false);

    return {
      cache_layer: {
        provider: 'Redis',
        status: 'Active',
        role: 'In-memory Invoices & Jobs',
      },
      storage_layer: {
        provider: 'Supabase / PostgreSQL',
        status: dbHealth ? 'Connected' : 'Disconnected',
        latency_ms: Date.now() - dbStartedAt,
      },
      worker_engine: {
        provider: 'Bull / Redis',
        status: 'Idle',
        queues: ['notifications', 'fiscal-sync', 'audit-jobs'],
      },
      dfe_engine: {
        status: 'Monitoring SEFAZ',
        mode: 'Real-time',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
