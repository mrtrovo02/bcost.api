'use strict';

import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { InsightsModule } from '../../insights/insights.module.js';

/**
 * DashboardModule: O Core de Business Intelligence do bCost.
 * * Este módulo orquestra a comunicação entre a camada Fiscal,
 * os serviços de IA (Insights) e o Cache de alta performance.
 */
@Module({
  imports: [
    PrismaModule, // Singleton do Banco de Dados
    FiscalModule, // Engine de Impostos e P&L
    InsightsModule, // Engine de CashFlow e Anomalias

    /**
     * ADIÇÃO: Configuração do CacheManager.
     * Registrado aqui para suportar o @UseInterceptors(CacheInterceptor) no Controller.
     */
    CacheModule.register({
      ttl: 300, // Tempo de vida padrão (5 minutos)
      max: 100, // Máximo de itens em memória simultâneos
      isGlobal: false, // Escopo restrito ao Dashboard para evitar colisões
    }),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    AnalyticsService,
    // Nota: CashFlowProjectionService e AnomalyDetectionService
    // já são providos pelo InsightsModule.
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
