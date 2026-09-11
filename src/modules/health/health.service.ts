'use strict';

import { statfs } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Interface que espelha a View v_database_performance do PostgreSQL.
 * Essencial para garantir que o TypeScript entenda o retorno do banco.
 */
export interface DbPerformanceMetric {
  tabela: string;
  buscas_sequenciais: number;
  buscas_por_indice: number;
  total_linhas: number;
  eficiencia_indice_percentual: number;
}

/**
 * Resposta formatada para o frontend/dashboard com metadados de saúde.
 */
export interface HealthMetricsResponse {
  timestamp: Date;
  status: 'healthy' | 'warning' | 'critical';
  companyId?: string;
  dbVersion: string;
  metrics: DbPerformanceMetric[];
}

export interface RuntimeDiagnosticsResponse {
  status: 'healthy' | 'warning';
  timestamp: string;
  process: {
    pid: number;
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
    uptimeSeconds: number;
    environment: string;
  };
  resources: {
    cpuCount: number;
    loadAverage: number[];
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      externalMb: number;
      systemFreeMb: number;
      systemTotalMb: number;
    };
    eventLoop: {
      utilization: number;
      active: number;
      idle: number;
    };
    filesystem?: {
      path: string;
      freeMb: number;
      totalMb: number;
      usedPercent: number;
    };
  };
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: {
    database: 'up' | 'down';
    heap: 'ok' | 'warning';
    eventLoop: 'ok' | 'warning';
  };
  runtime: Pick<RuntimeDiagnosticsResponse, 'process' | 'resources'>;
  timestamp: string;
}

type PgStatUserTableHealthRow = {
  idx_scan: bigint | number;
};

type DatabasePerformanceViewAccessRow = {
  can_read: boolean | null;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private prisma: PrismaService) {}

  private toMb(bytes: number): number {
    return Number((bytes / 1024 / 1024).toFixed(2));
  }

  private async getFilesystemSnapshot(path = process.cwd()) {
    try {
      const stats = await statfs(path);
      const free = stats.bavail * stats.bsize;
      const total = stats.blocks * stats.bsize;
      const usedPercent =
        total > 0 ? Number((((total - free) / total) * 100).toFixed(2)) : 0;

      return {
        path,
        freeMb: this.toMb(free),
        totalMb: this.toMb(total),
        usedPercent,
      };
    } catch (error) {
      this.logger.warn(
        `Filesystem snapshot indisponível: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  async getRuntimeDiagnostics(): Promise<RuntimeDiagnosticsResponse> {
    const memory = process.memoryUsage();
    const eventLoop = performance.eventLoopUtilization();
    const filesystem = await this.getFilesystemSnapshot();

    const heapUsedPercent =
      memory.heapTotal > 0 ? (memory.heapUsed / memory.heapTotal) * 100 : 0;
    const isHeapWarning = heapUsedPercent >= 90;
    const isEventLoopWarning = eventLoop.utilization >= 0.95;

    return {
      status: isHeapWarning || isEventLoopWarning ? 'warning' : 'healthy',
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
      },
      resources: {
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
        memory: {
          rssMb: this.toMb(memory.rss),
          heapUsedMb: this.toMb(memory.heapUsed),
          heapTotalMb: this.toMb(memory.heapTotal),
          externalMb: this.toMb(memory.external),
          systemFreeMb: this.toMb(os.freemem()),
          systemTotalMb: this.toMb(os.totalmem()),
        },
        eventLoop: {
          utilization: Number(eventLoop.utilization.toFixed(4)),
          active: Number(eventLoop.active.toFixed(2)),
          idle: Number(eventLoop.idle.toFixed(2)),
        },
        ...(filesystem ? { filesystem } : {}),
      },
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const [database, runtime] = await Promise.all([
      this.prisma.isHealthy(),
      this.getRuntimeDiagnostics(),
    ]);

    const heapWarning =
      runtime.resources.memory.heapTotalMb > 0 &&
      runtime.resources.memory.heapUsedMb /
        runtime.resources.memory.heapTotalMb >=
        0.9;
    const eventLoopWarning = runtime.resources.eventLoop.utilization >= 0.95;

    return {
      status: database && !eventLoopWarning ? 'ready' : 'not_ready',
      checks: {
        database: database ? 'up' : 'down',
        heap: heapWarning ? 'warning' : 'ok',
        eventLoop: eventLoopWarning ? 'warning' : 'ok',
      },
      runtime: {
        process: runtime.process,
        resources: runtime.resources,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async canReadDatabasePerformanceView(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<DatabasePerformanceViewAccessRow[]>`
        SELECT COALESCE(
          has_table_privilege(current_user, 'public.v_database_performance', 'SELECT'),
          false
        ) AS can_read
        WHERE to_regclass('public.v_database_performance') IS NOT NULL
      `;

      return rows[0]?.can_read === true;
    } catch (error) {
      this.logger.warn(
        `View de performance indisponível para a role atual: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Obtém métricas de eficiência de índices e saúde geral do banco.
   * Diferencial 2026: Diagnóstico proativo de lentidão antes de afetar o cliente.
   * * @param companyId Identificador opcional para isolamento de logs.
   */
  async getDatabaseMetrics(companyId?: string): Promise<HealthMetricsResponse> {
    try {
      const [canReadMetrics, dbVersionInfo] = await Promise.all([
        this.canReadDatabasePerformanceView(),
        this.prisma.$queryRaw<{ version: string }[]>`SELECT version()`,
      ]);

      const metricsResult = canReadMetrics
        ? await this.prisma.$queryRaw<DbPerformanceMetric[]>`
            SELECT 
              tabela,
              buscas_sequenciais,
              buscas_por_indice,
              total_linhas,
              eficiencia_indice_percentual
            FROM v_database_performance
          `
        : [];

      const versionResult = dbVersionInfo;

      const hasBottleneck = metricsResult.some(
        (m) => Number(m.eficiencia_indice_percentual) < 80,
      );
      const status = !canReadMetrics || hasBottleneck ? 'warning' : 'healthy';

      if (!canReadMetrics) {
        this.logger.warn(
          `Métricas da view v_database_performance indisponíveis para a role atual${
            companyId ? ` na empresa ${companyId}` : ''
          }. A readiness permanece válida sem este diagnóstico opcional.`,
        );
      }

      return {
        timestamp: new Date(),
        status,
        companyId,
        dbVersion: versionResult[0]?.version || 'PostgreSQL Unknown',
        metrics: metricsResult.map((m) => ({
          tabela: m.tabela,
          buscas_sequenciais: Number(m.buscas_sequenciais || 0),
          buscas_por_indice: Number(m.buscas_por_indice || 0),
          total_linhas: Number(m.total_linhas || 0),
          eficiencia_indice_percentual: Number(
            m.eficiencia_indice_percentual || 0,
          ),
        })),
      };
    } catch (error) {
      this.logger.warn(
        `⚠️ Diagnóstico de performance não disponível: ${String(error)}`,
      );
      return {
        timestamp: new Date(),
        status: 'critical',
        companyId,
        dbVersion: 'PostgreSQL Unknown',
        metrics: [],
      };
    }
  }

  /**
   * Função utilitária para verificar se uma tabela específica está saudável.
   * Útil para o FactorREngineService verificar se a tabela de Financeiro está rápida.
   */
  async checkTableHealth(tableName: string): Promise<boolean> {
    const result = await this.prisma.$queryRaw<PgStatUserTableHealthRow[]>`
      SELECT idx_scan FROM pg_stat_user_tables WHERE relname = ${tableName}
    `;
    return result.length > 0;
  }
}
