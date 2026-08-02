'use strict';

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
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

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Obtém métricas de eficiência de índices e saúde geral do banco.
   * Diferencial 2026: Diagnóstico proativo de lentidão antes de afetar o cliente.
   * * @param companyId Identificador opcional para isolamento de logs.
   */
  async getDatabaseMetrics(companyId?: string): Promise<HealthMetricsResponse> {
    try {
      const [metrics, dbVersionInfo] = await Promise.allSettled([
        this.prisma.$queryRaw<DbPerformanceMetric[]>`
          SELECT 
            tabela,
            buscas_sequenciais,
            buscas_por_indice,
            total_linhas,
            eficiencia_indice_percentual
          FROM v_database_performance
        `,
        this.prisma.$queryRaw<{ version: string }[]>`SELECT version()`,
      ]);

      const metricsResult = metrics.status === 'fulfilled' ? metrics.value : [];
      const versionResult =
        dbVersionInfo.status === 'fulfilled' ? dbVersionInfo.value : [];

      const hasBottleneck = metricsResult.some(
        (m) => Number(m.eficiencia_indice_percentual) < 80,
      );
      const status = hasBottleneck ? 'warning' : 'healthy';

      if (metrics.status === 'rejected') {
        this.logger.warn(
          `⚠️ Métricas do banco indisponíveis${companyId ? ` para a empresa ${companyId}` : ''}: ${String(metrics.reason)}`,
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
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT idx_scan FROM pg_stat_user_tables WHERE relname = ${tableName}
    `;
    return result.length > 0;
  }
}
