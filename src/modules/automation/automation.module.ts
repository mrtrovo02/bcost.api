'use strict';

import { Module } from '@nestjs/common';

// Serviços Core do Módulo
import { AutomationService } from './automation.service.js';
import { AutomationJobService } from './automation-job.service.js';
import { AutomationController } from './automation.controller.js';

// Módulos Externos (Provedores de Business Logic)
import { RevenueModule } from '../revenue/revenue.module.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

/**
 * AutomationModule: O Hub de Orquestração e Autonomia do bCost.
 * * Este módulo centraliza:
 * 1. Agendamentos Temporais (@Cron) via AutomationService.
 * 2. Gestão de Estado de Tarefas (Logs/Status) via AutomationJobService.
 * 3. Interoperabilidade entre Fiscal, Faturamento e Analytics.
 */
@Module({
  imports: [
    // Módulos que exportam os serviços necessários para os Jobs
    RevenueModule, // Provê: RevenueService
    FiscalModule, // Provê: TaxCalculationService, ComplianceService
    AnalyticsModule, // Provê: ForecastingService
  ],
  controllers: [
    // Endpoints REST para controle e telemetria dos Jobs
    AutomationController,
  ],
  providers: [
    /**
     * AutomationService: Responsável por disparar os processos agendados.
     */
    AutomationService,

    /**
     * AutomationJobService: Responsável por CRUD e lógica de suporte aos Jobs,
     * injetado pelo AutomationController para monitoramento.
     */
    AutomationJobService,
  ],
  exports: [
    // Exportamos ambos para uso em módulos de Auditoria ou Admin
    AutomationService,
    AutomationJobService,
  ],
})
export class AutomationModule {}
