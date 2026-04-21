'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { FinancialEventType } from '@prisma/client';
import { AlertService } from '../../notifications/services/alert.service.js';

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertService: AlertService,
  ) {}

  /**
   * Analisa se o novo evento financeiro é uma anomalia baseada no histórico.
   * Mandamento: Proteção proativa do cliente (Vencer Domínio/Contimatic).
   */
  async detectTaxAnomaly(
    companyId: string,
    currentAmount: number,
    type: FinancialEventType,
  ) {
    // 1. Busca os últimos 12 eventos do mesmo tipo para calcular a média (Janela Deslizante)
    const history = await this.prisma.extended.financialEvent.findMany({
      where: { companyId, type },
      orderBy: { occurredAt: 'desc' },
      take: 12,
    });

    if (history.length < 3) return; // Base de dados insuficiente para análise

    const amounts = history.map((h: any) => Number(h.amount));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // 2. Cálculo de Desvio Padrão Simples
    const variance =
      amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // 3. Critério de Anomalia: Se o valor atual for > 2 Desvios Padrão da média (95% de confiança)
    const threshold = mean + stdDev * 2;

    if (currentAmount > threshold) {
      this.logger.warn(
        `🚨 Anomalia Detectada na Empresa ${companyId}: R$ ${currentAmount} (Média: ${mean.toFixed(2)})`,
      );

      await this.alertService.triggerAnomalyAlert({
        companyId,
        severity: 'HIGH',
        message: `Detecção de valor atípico para ${type}: R$ ${currentAmount}. O valor médio esperado era R$ ${mean.toFixed(2)}.`,
        metadata: { mean, stdDev, currentAmount },
      });
    }
  }
}
