'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service.js';
import { CashFlowProjectionService } from './cash-flow-projection/cash-flow-projection.service.js';

@Injectable()
export class InsightsCronService {
  private readonly logger = new Logger(InsightsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashFlowService: CashFlowProjectionService,
  ) {}

  /**
   * 🌙 Processamento Noturno (03:00 AM)
   * Garante que todas as empresas ativas tenham projeções de 90 dias atualizadas.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyProjections() {
    this.logger.log('🚀 [JOB] Iniciando motor de projeção em lote...');

    // 1. Busca apenas empresas ativas conforme seu schema.prisma
    const activeCompanies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    this.logger.debug(
      `📊 ${activeCompanies.length} empresas selecionadas para atualização.`,
    );

    for (const company of activeCompanies) {
      try {
        // Gera e persiste no banco (tabela cash_flow_projections)
        await this.cashFlowService.generateProjection(company.id, 90);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `❌ Falha na projeção da empresa ${company.name}: ${message}`,
        );
      }
    }

    this.logger.log('🏁 [JOB] Processamento concluído.');
  }
}
