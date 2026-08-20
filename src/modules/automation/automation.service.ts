'use strict';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RevenueService } from '../revenue/revenue.service.js';
import { ComplianceService } from '../fiscal/compliance/compliance.service.js';
import { TaxCalculationService } from '../fiscal/tax/tax-calculation.service.js';
import { ForecastingService } from '../analytics/forecasting.service.js';
import { AnomalyDetectionService } from '../analytics/anomaly-detection.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JobStatus, Prisma } from '@prisma/client';

@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly logger = new Logger('bCost-Automation');
  private readonly SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly revenueService: RevenueService,
    private readonly complianceService: ComplianceService,
    private readonly taxService: TaxCalculationService,
    private readonly forecastingService: ForecastingService,
    private readonly anomalyService: AnomalyDetectionService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.logger.log(
      '⚙️ Motor de Automação inicializado com IA de Detecção de Anomalias.',
    );
  }

  /**
   * JOB 01: Faturamento Automático (08:00 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, {
    name: 'billing_cycle_job',
    timeZone: 'America/Sao_Paulo',
  })
  async handleDailyBilling() {
    this.logger.log('🚀 [Job] Iniciando ciclo de faturamento recorrente...');

    const activeCompanies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    for (const company of activeCompanies) {
      const jobRecord = await this.prisma.automationJob.create({
        data: {
          companyId: company.id,
          name: `BILLING_${new Date().toISOString().split('T')[0]}`,
          type: 'REVENUE_BILLING',
          status: JobStatus.RUNNING,
          startedAt: new Date(),
        },
      });

      try {
        const result = await this.revenueService.processMonthlyBilling(
          company.id,
        );

        await this.prisma.automationJob.update({
          where: { id: jobRecord.id },
          data: {
            status: JobStatus.COMPLETED,
            progress: 100,
            result: result as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `❌ Falha no faturamento de ${company.name}: ${message}`,
        );
        await this.prisma.automationJob.update({
          where: { id: jobRecord.id },
          data: {
            status: JobStatus.FAILED,
            result: { error: message },
            completedAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * JOB 02: Fechamento Fiscal Automático (Todo dia 01 às 03:00 AM)
   */
  @Cron('0 3 1 * *', {
    name: 'monthly_tax_closure_job',
    timeZone: 'America/Sao_Paulo',
  })
  async handleMonthlyTaxClosure() {
    const now = new Date();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    const year =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    this.logger.log(
      `📊 [Job] Iniciando fechamento fiscal da competência ${month}/${year}`,
    );

    const companies = await this.prisma.company.findMany({
      where: { active: true },
    });

    for (const company of companies) {
      const jobRecord = await this.prisma.automationJob.create({
        data: {
          companyId: company.id,
          name: `TAX_CLOSING_${month}_${year}`,
          type: 'FISCAL_CLOSING',
          status: JobStatus.RUNNING,
          startedAt: new Date(),
        },
      });

      try {
        const result = await this.taxService.closeMonthAndGenerateObligation(
          company.id,
          month,
          year,
          this.SYSTEM_USER_ID,
        );

        await this.prisma.automationJob.update({
          where: { id: jobRecord.id },
          data: {
            status: JobStatus.COMPLETED,
            progress: 100,
            result: result as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `⚠️ Erro no fechamento de ${company.name}: ${message}`,
        );
        await this.prisma.automationJob.update({
          where: { id: jobRecord.id },
          data: {
            status: JobStatus.FAILED,
            result: { error: message },
            completedAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * JOB 03: Forecasting & IA (Diário às 11:00 PM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_11PM, {
    name: 'cashflow_forecasting_job',
    timeZone: 'America/Sao_Paulo',
  })
  async handleForecasting() {
    this.logger.log(
      '📈 [Job] Atualizando projeções preditivas de fluxo de caixa...',
    );

    const companies = await this.prisma.company.findMany({
      where: { active: true },
    });

    for (const company of companies) {
      try {
        await this.forecastingService.generateThreeMonthProjection(company.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `❌ Falha na projeção da empresa ${company.id}: ${message}`,
        );
      }
    }
  }

  /**
   * JOB 04: Verificação de Compliance (09:00 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'compliance_health_job',
    timeZone: 'America/Sao_Paulo',
  })
  async handleComplianceChecks() {
    try {
      const result = await this.complianceService.checkCertificatesHealth();
      this.logger.log(
        `✅ Compliance verificado. Alertas: ${result?.alerts || 0}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Erro no Job de Compliance: ${message}`);
    }
  }

  /**
   * JOB 05: Detecção de Anomalias (Diário às 01:00 AM)
   * Realiza varredura em busca de duplicidades e outliers financeiros.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'anomaly_detection_job',
    timeZone: 'America/Sao_Paulo',
  })
  async handleAnomalyDetection() {
    this.logger.log('🔍 [IA] Iniciando varredura diária de anomalias...');

    const companies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    for (const company of companies) {
      try {
        const results = await this.anomalyService.processCompanyAnomalies(
          company.id,
        );
        if (results.length > 0) {
          this.logger.warn(
            `⚠️ ${results.length} potenciais anomalias identificadas para ${company.name}.`,
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `❌ Falha na detecção de anomalias da empresa ${company.id}: ${message}`,
        );
      }
    }
  }
}
