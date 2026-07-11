'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { ForecastingService } from './forecasting.service.js';

/**
 * AnalyticsModule: Responsável pelo processamento de Business Intelligence (BI)
 * e Projeções Financeiras (IA).
 */
@Module({
  imports: [
    // Acesso ao banco de dados para leitura de Invoices e Contracts
    PrismaModule,
  ],
  controllers: [
    // Reservado para AnalyticsController (Dashboards) no futuro
  ],
  providers: [
    // O motor de cálculo preditivo que o AutomationService utiliza
    ForecastingService,
  ],
  exports: [
    // Exportamos o serviço para que a automação possa acessá-lo
    ForecastingService,
  ],
})
export class AnalyticsModule {}
