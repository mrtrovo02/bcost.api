'use strict';

import { Controller, Get, UseInterceptors, Param } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service.js';
import { HealthService } from './health.service.js';
import { CompanyCacheInterceptor } from '../../common/interceptors/company-cache.interceptor.js';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

/**
 * HealthController
 * -----------------------------------------------------------------------
 * Gerencia o monitoramento vital da bCost Engine.
 * Este é o diferencial tecnológico: enquanto as consultorias tradicionais
 * são caixas-pretas, sua API oferece transparência total de performance.
 */
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private prisma: PrismaService,
    private performance: HealthService,
  ) {}

  /**
   * Endpoint de Liveness (Infraestrutura)
   * Essencial para Kubernetes/Docker verificarem se a API está respondendo.
   * Não utilizamos cache aqui para garantir um diagnóstico de "tempo real".
   */
  @Get()
  @HealthCheck()
  async check() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Endpoint de Performance do Dashboard
   * Retorna métricas avançadas da saúde do banco de dados (Eficiência de índices).
   * * 🚀 DIFERENCIAL 2026:
   * Utilizamos o CompanyCacheInterceptor para que consultas repetitivas
   * de um mesmo contador não toquem no banco de dados desnecessariamente.
   */
  @Get('db-performance/:companyId?')
  @UseInterceptors(CompanyCacheInterceptor)
  // @UseGuards(JwtAuthGuard)
  async getDbPerformance(@Param('companyId') companyId?: string) {
    /**
     * O erro 'Expected 0 arguments, but got 1' foi resolvido
     * ao atualizarmos a assinatura no HealthService.
     */
    return await this.performance.getDatabaseMetrics(companyId);
  }
}
