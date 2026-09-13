'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { ForecastingService } from './forecasting.service.js';
import { AnomalyDetectionService } from './anomaly-detection.service.js';

/**
 * AnalyticsModule: Responsável pelo processamento de Business Intelligence (BI),
 * Projeções Financeiras (Forecasting) e Detecção de Anomalias via IA.
 */
@Module({
  imports: [
    // Acesso centralizado ao banco de dados para leitura de Invoices, Transactions e Logs
    PrismaModule,
  ],
  controllers: [
    // Futuro: AnalyticsController para endpoints de BI e Insights
  ],
  providers: [
    // Serviço responsável por projeções de fluxo de caixa futuro
    ForecastingService,
    // Serviço responsável pela detecção de fraudes, duplicidades e outliers
    AnomalyDetectionService,
  ],
  exports: [
    // Exportamos ambos os serviços para que o AutomationService e outros módulos possam consumi-los
    ForecastingService,
    AnomalyDetectionService,
  ],
})
export class AnalyticsModule {}
