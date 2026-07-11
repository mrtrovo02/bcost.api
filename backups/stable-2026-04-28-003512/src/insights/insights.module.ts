'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { CashFlowProjectionService } from './cash-flow-projection/cash-flow-projection.service.js';
import { AnomalyDetectionService } from './anomaly-detection/anomaly-detection.service.js';
import { AdvisoryService } from './advisory/advisory.service.js';
import { InsightsCronService } from './cron/insights-cron.service.js'; // Novo: Motor de Automação

/**
 * InsightsModule | bCost Enterprise Stack
 * -----------------------------------------------------------------------
 * Core de Inteligência Financeira.
 * Este módulo centraliza a lógica de Data Science aplicada à contabilidade.
 */
@Module({
  imports: [PrismaModule],
  controllers: [InsightsController],
  providers: [
    InsightsService, // Orquestrador
    CashFlowProjectionService, // Motor de Previsão
    AnomalyDetectionService, // Auditoria Estatística
    AdvisoryService, // Consultoria Estratégica
    InsightsCronService, // 🔥 Novo: Agendador de Tarefas (Cron)
  ],
  exports: [
    // 🛡️ ADICIONADO: Exportação explícita para resolver o erro no DashboardController
    InsightsService,
    CashFlowProjectionService,
    AnomalyDetectionService,
    AdvisoryService,
  ],
})
export class InsightsModule {}
