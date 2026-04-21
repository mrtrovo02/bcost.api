'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export interface FiscalHealthScore {
  score: number;
  totalObligations: number;
  paidObligations: number;
  pendingObligations: number;
  rating: 'EXCELENTE' | 'BOM' | 'ALERTA' | 'CRÍTICO';
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * HISTÓRICO DE FATURAMENTO
   * Baseado nos snapshots consolidados mensais.
   */
  async getRevenueHistory(companyId: string) {
    const snapshots = await this.prisma.financialSnapshot.findMany({
      where: { companyId },
      select: { month: true, year: true, revenue: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
    });

    return snapshots
      .map((s) => ({
        // Formato MM/YYYY para o gráfico
        period: `${s.month.toString().padStart(2, '0')}/${s.year}`,
        total: Number(s.revenue),
      }))
      .reverse(); // Inverte para ordem cronológica (passado -> presente)
  }

  /**
   * SCORE DE SAÚDE FISCAL
   * Calcula a eficiência de pagamento de obrigações tributárias.
   */
  async getFiscalHealthScore(companyId: string): Promise<FiscalHealthScore> {
    const obligations = await this.prisma.taxObligation.findMany({
      where: { companyId },
      select: { status: true },
    });

    if (obligations.length === 0) {
      return {
        score: 100,
        totalObligations: 0,
        paidObligations: 0,
        pendingObligations: 0,
        rating: 'EXCELENTE',
      };
    }

    const total = obligations.length;
    // 🚀 Uso de Casting para evitar erro de Enum se houver conflito de tipos global
    const paid = obligations.filter((o) => o.status === ('PAID' as any)).length;
    const score = Math.round((paid / total) * 100);

    return {
      score,
      totalObligations: total,
      paidObligations: paid,
      pendingObligations: total - paid,
      rating:
        score >= 90
          ? 'EXCELENTE'
          : score >= 70
            ? 'BOM'
            : score >= 50
              ? 'ALERTA'
              : 'CRÍTICO',
    };
  }

  /**
   * PREVISÃO DE IMPOSTOS (Tax Engine)
   * Analisa a média das últimas apurações para projetar o próximo DAS/Guia.
   */
  async getTaxProjection(companyId: string) {
    const lastCalculations = await this.prisma.taxCalculation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { totalAmount: true },
    });

    if (lastCalculations.length === 0)
      return { projectedAmount: 0, confidence: 'BAIXA' };

    const sum = lastCalculations.reduce(
      (acc, curr) => acc + Number(curr.totalAmount),
      0,
    );
    const average = sum / lastCalculations.length;

    return {
      projectedAmount: Number(average.toFixed(2)),
      confidence: lastCalculations.length >= 3 ? 'ALTA' : 'MÉDIA',
    };
  }

  /**
   * SUMÁRIO EXECUTIVO (Dashboard Inteligente)
   * Consolida KPIs financeiros e fiscais em uma única chamada.
   */
  async getExecutiveSummary(companyId: string) {
    const startTime = Date.now();
    try {
      const [score, revenueHistory, payroll, taxProjection] = await Promise.all(
        [
          this.getFiscalHealthScore(companyId),
          this.getRevenueHistory(companyId),
          this.prisma.payroll.findFirst({
            where: { companyId },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
          }),
          this.getTaxProjection(companyId),
        ],
      );

      return {
        companyId,
        fiscalScore: score,
        revenueHistory,
        taxProjection,
        // 🚀 CORREÇÃO TS2339: Removido 'referenceMonth' e reconstruído a partir de year/month
        lastPayroll: payroll
          ? {
              amount: Number(payroll.totalAmount),
              reference: `${String(payroll.month).padStart(2, '0')}/${payroll.year}`,
              details: {
                salaries: Number(payroll.salariesAmount),
                proLabore: Number(payroll.proLaboreAmount),
              },
            }
          : null,
        generatedAt: new Date(),
        processingTime: `${Date.now() - startTime}ms`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Analytics Critical] Falha ao gerar sumário executivo: ${message}`,
      );
      throw error;
    }
  }
}
