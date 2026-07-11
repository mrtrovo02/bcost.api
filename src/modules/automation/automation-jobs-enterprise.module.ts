'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { RevenueModule } from '../revenue/revenue.module.js';
import { AutomationJobsEnterpriseController } from './automation-jobs-enterprise.controller.js';
import { AutomationJobsEnterpriseService } from './automation-jobs-enterprise.service.js';

/**
 * AutomationJobsEnterpriseModule
 *
 * Módulo dedicado para ações operacionais enterprise de automação.
 *
 * Importante:
 * - Não substitui AutomationModule existente.
 * - Não remove rotas antigas.
 * - Não altera /automation/metrics.
 * - Expõe endpoints operacionais em /automation/jobs.
 * - Importa RevenueModule para permitir retry executável de REVENUE_BILLING.
 */
@Module({
  imports: [PrismaModule, RevenueModule],
  controllers: [AutomationJobsEnterpriseController],
  providers: [AutomationJobsEnterpriseService],
  exports: [AutomationJobsEnterpriseService],
})
export class AutomationJobsEnterpriseModule {}
