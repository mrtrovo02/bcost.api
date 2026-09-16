'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InsightsService } from '../insights.service.js';

/**
 * InsightsCronService | bCost Autonomous Engine
 * -----------------------------------------------------------------------
 * O "mordomo digital" que garante que os dados estejam sempre quentes.
 */
@Injectable()
export class InsightsCronService {
  private readonly logger = new Logger(InsightsCronService.name);

  constructor(private readonly insightsService: InsightsService) {}

  /**
   * Executa a atualização massiva de snapshots e projeções às 03:00 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyInsightsUpdate() {
    this.logger.log(
      '🌅 [Cron] Iniciando processamento diário de Inteligência Financeira...',
    );

    try {
      const result = await this.insightsService.runProjectionBatch();
      this.logger.log(
        `✅ [Cron] Sucesso: ${result.processed} empresas processadas.`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ [Cron] Falha crítica no lote diário: ${message}`);
    }
  }
}
