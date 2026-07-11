'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ForecastingService {
  private readonly logger = new Logger('bCost-Forecasting-Engine');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gera projeção de 3 meses baseada em Contratos (Recorrência) e Invoices (Histórico).
   * Alinhado ao modelo CashFlowProjection do Schema.
   */
  async generateThreeMonthProjection(companyId: string) {
    this.logger.log(
      `[Forecasting] Gerando predições para empresa: ${companyId}`,
    );

    // 1. Busca Contratos Ativos (Receita Garantida)
    const contracts = await this.prisma.contract.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
    });

    // 2. Busca Média de Faturamento (Últimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalRevenue = await this.prisma.invoice.aggregate({
      where: { companyId, issuedAt: { gte: sixMonthsAgo }, status: 'NORMAL' },
      _avg: { amount: true },
    });

    const monthlyAvg = Number(historicalRevenue._avg.amount || 0);
    const contractTotal = contracts.reduce(
      (acc, curr) => acc + Number(curr.amount),
      0,
    );

    // 3. Montagem do JSON de Projeção (Estrutura para o Dashboard)
    const projectionData = [
      {
        month: 'M+1',
        expectedRevenue: contractTotal + monthlyAvg * 0.1,
        confidence: 0.92,
      },
      {
        month: 'M+2',
        expectedRevenue: contractTotal + monthlyAvg * 0.15,
        confidence: 0.85,
      },
      {
        month: 'M+3',
        expectedRevenue: contractTotal + monthlyAvg * 0.2,
        confidence: 0.78,
      },
    ];

    // 4. Persistência no Modelo CashFlowProjection
    return await this.prisma.cashFlowProjection.create({
      data: {
        companyId,
        projectionDate: new Date(),
        data: projectionData as Prisma.InputJsonValue,
      },
    });
  }
}
