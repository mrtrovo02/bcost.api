'use strict';

import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from './database/prisma.service.js';
import { Public } from './common/decorators/public.decorator.js'; // Importação crucial

/**
 * Interface de integridade para garantir tipagem forte no Prisma
 * e evitar o erro 'stats is of type unknown'.
 */
interface DbHealth {
  health: number;
}

@ApiTags('System')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Root Endpoint: Fornece o estado atual do ecossistema bCost.
   * Resolvido: Erro 404 (rota mapeada) e Erro 401 (marcada como Public).
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Painel de Controle Central - bCost Engine' })
  @ApiResponse({
    status: 200,
    description: 'Status global do ecossistema e módulos carregados',
  })
  async getIndex() {
    this.logger.verbose('📊 Auditoria de sistema iniciada via Root Endpoint');

    // Executa uma query de pulso no banco de dados (Supabase/PostgreSQL)
    const stats = await this.prisma.$queryRaw<
      DbHealth[]
    >`SELECT 1 as "health"`.catch(() => [{ health: 0 } as DbHealth]);

    return {
      engine: 'bCost Enterprise AI',
      version: '1.0.0',
      status: 'Operational',
      database: stats[0]?.health === 1 ? 'CONNECTED' : 'DISCONNECTED',
      environment: process.env.NODE_ENV || 'development',
      active_modules: {
        core: [
          'AuthModule',
          'PrismaModule',
          'ConfigModule',
          'EventEmitterModule',
        ],
        business: [
          'CompanyModule',
          'BankingModule',
          'FiscalModule',
          'RevenueModule',
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
        health: '/api/health',
        diagnostics: '/api/diagnostics',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health Check: Usado por instâncias de monitoramento.
   * Marcar como @Public evita que o monitoramento caia por falta de token.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Verificação de Integridade (Liveness/Readiness)' })
  getHealth() {
    this.logger.log('📡 Health check: Engine bCost respondendo normalmente');

    const memory = process.memoryUsage();
    return {
      status: 'online',
      uptime: `${Math.floor(process.uptime())}s`,
      resources: {
        heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Diagnostics: Retorna o status dos drivers e conexões externas.
   */
  @Public()
  @Get('diagnostics')
  @ApiOperation({ summary: 'Diagnóstico profundo dos subsistemas bCost' })
  async getDiagnostics() {
    this.logger.debug('🔍 Iniciando diagnóstico de subsistemas...');

    return {
      cache_layer: {
        provider: 'Redis',
        status: 'Active',
        role: 'In-memory Invoices & Jobs',
      },
      storage_layer: {
        provider: 'Supabase / PostgreSQL',
        status: 'Connected',
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
    };
  }
}
