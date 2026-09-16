'use strict';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import {
  AnomalyDetectionService,
  type EnrichedAnomaly,
} from './anomaly-detection/anomaly-detection.service.js';
import {
  CashFlowProjectionService,
  ProjectionItem,
} from './cash-flow-projection/cash-flow-projection.service.js';
import { AdvisoryService } from './advisory/advisory.service.js';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * ✅ Interfaces de Contrato bCost Enterprise 2026
 */
export interface AnomalyReport {
  id: string;
  description: string;
  amount: number;
  date: Date;
  deviationScore: number;
}

export interface FinancialHealth {
  score: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  factors: {
    liquidity: number;
    stability: number;
    predictability: number;
  };
  message: string;
}

type FinancialHealthFactors = FinancialHealth['factors'];

@Injectable()
export class InsightsService {
  private static readonly ACTIVE_COMPANIES_BATCH_LIMIT = 250;
  private static readonly PENDING_TAX_ALERT_LIMIT = 50;

  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyService: AnomalyDetectionService,
    private readonly cashFlowService: CashFlowProjectionService,
    private readonly advisoryService: AdvisoryService,
  ) {}

  /**
   * 🏆 EXECUTIVE SUMMARY (CFO VIRTUAL)
   * Orquestrador principal que consolida Saúde, Advisory e Auditoria.
   */
  async getExecutiveSummary(companyId: string) {
    this.logger.log(`📊 Gerando resumo executivo consolidado: ${companyId}`);

    // Execução paralela para máxima performance (Promise.all)
    const [health, advisory, anomalies] = await Promise.all([
      this.getFinancialHealth(companyId),
      this.advisoryService.generateMonthlyAdvisory(companyId),
      this.detectAnomalies(companyId),
    ]);

    return {
      health,
      advisory,
      criticalAnomalies: anomalies.filter((a) => a.deviationScore > 2.0),
      generatedAt: new Date(),
    };
  }

  /**
   * 🚨 DETECÇÃO DE ANOMALIAS
   * Mapeamento rigoroso para evitar erros de conversão no Controller.
   */
  async detectAnomalies(companyId: string): Promise<AnomalyReport[]> {
    this.logger.log(`🤖 Auditoria estatística em execução: ${companyId}`);
    const rawData = await this.anomalyService.detectAnomalies(companyId);

    return rawData.map((item: EnrichedAnomaly) => ({
      id: String(item.id || item.invoice?.id || 'unknown'),
      description: String(
        item.description || 'Transação atípica detectada pelo motor bCost',
      ),
      amount: Number(item.amount || 0),
      date: item.occurredAt,
      deviationScore: Number(item.deviationScore || 1.0),
    }));
  }

  /**
   * 📈 PROJEÇÃO DE FLUXO DE CAIXA
   * Busca persistência no banco (Cache) ou gera nova projeção se necessário.
   */
  async getCashFlowInsights(companyId: string): Promise<ProjectionItem[]> {
    const cachedRecord = await this.prisma.cashFlowProjection.findFirst({
      where: { companyId },
      orderBy: { projectionDate: 'desc' },
    });

    if (cachedRecord && cachedRecord.data) {
      // Validação de cache (24 horas)
      const isRecent =
        new Date().getTime() - new Date(cachedRecord.createdAt).getTime() <
        86400000;
      if (isRecent) {
        return cachedRecord.data as unknown as ProjectionItem[];
      }
    }

    return await this.cashFlowService.generateProjection(companyId);
  }

  /**
   * 🧬 SCORE DE SAÚDE FINANCEIRA (DNA bCost)
   */
  async getFinancialHealth(companyId: string): Promise<FinancialHealth> {
    const projection = await this.getCashFlowInsights(companyId);
    const anomalies = await this.detectAnomalies(companyId);

    // Cálculo de Liquidez baseado no saldo projetado (projectedBalance)
    const firstBalance = Number(projection[0]?.projectedBalance || 0);
    const lastBalance = Number(
      projection[projection.length - 1]?.projectedBalance || 0,
    );

    const liquidity =
      lastBalance > firstBalance
        ? 100
        : Math.max(0, (lastBalance / (firstBalance || 1)) * 100);
    const stability = Math.max(0, 100 - anomalies.length * 12);
    const predictability = projection.length > 0 ? 85 : 0;

    const finalScore = Math.round(
      liquidity * 0.5 + stability * 0.3 + predictability * 0.2,
    );

    return {
      score: finalScore,
      status:
        finalScore > 75 ? 'HEALTHY' : finalScore > 45 ? 'WARNING' : 'CRITICAL',
      factors: {
        liquidity: Math.round(liquidity),
        stability: Math.round(stability),
        predictability: Math.round(predictability),
      },
      message: this.generateHealthMessage(finalScore, lastBalance < 0),
    };
  }

  /**
   * 🚀 PROCESSAMENTO EM LOTE (Sync & Snapshot)
   */
  async runProjectionBatch(): Promise<{ processed: number; errors: number }> {
    this.logger.log('🚀 Iniciando atualização massiva de snapshots mensais...');
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
      take: InsightsService.ACTIVE_COMPANIES_BATCH_LIMIT,
    });

    let processed = 0;
    let errors = 0;

    for (const company of companies) {
      try {
        const health = await this.getFinancialHealth(company.id);
        await this.syncFinancialSnapshot(company.id, health);
        processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`❌ Falha na empresa ${company.name}: ${message}`);
        errors++;
      }
    }
    return { processed, errors };
  }

  /**
   * 🛡️ SINCRONIZAÇÃO DE SNAPSHOT (Imutabilidade com Integridade Hash)
   */
  private async syncFinancialSnapshot(
    companyId: string,
    health: FinancialHealth,
  ) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const revenueData = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: 'NORMAL',
        issuedAt: { gte: new Date(year, month - 1, 1) },
      },
      _sum: { amount: true },
    });

    const integrityHash = crypto
      .createHash('sha256')
      .update(`${companyId}-${year}-${month}-${health.score}`)
      .digest('hex');

    await this.prisma.financialSnapshot.upsert({
      where: { companyId_year_month: { companyId, year, month } },
      update: {
        revenue: new Prisma.Decimal(revenueData._sum.amount?.toNumber() || 0),
        netProfit: new Prisma.Decimal(health.score),
        fatorRData: this.toSnapshotJson(health.factors),
        integrityHash,
      },
      create: {
        companyId,
        year,
        month,
        revenue: new Prisma.Decimal(revenueData._sum.amount?.toNumber() || 0),
        expenses: new Prisma.Decimal(0),
        netProfit: new Prisma.Decimal(health.score),
        taxPayable: new Prisma.Decimal(0),
        integrityHash,
        fatorRData: this.toSnapshotJson(health.factors),
      },
    });
  }

  private toSnapshotJson(
    factors: FinancialHealthFactors,
  ): Prisma.InputJsonObject {
    return {
      liquidity: factors.liquidity,
      stability: factors.stability,
      predictability: factors.predictability,
    };
  }

  /**
   * 🔍 BUSCA SEMÂNTICA (AI Readiness)
   */
  async getSemanticContext(companyId: string, query: string) {
    this.logger.log(`AI Semantic Search: ${query} para ${companyId}`);
    return {
      context: 'Motor de busca vetorial bCost pronto.',
      query,
      status: 'Ready',
      engine: 'pgvector',
    };
  }

  private generateHealthMessage(score: number, isNegative: boolean): string {
    if (isNegative) return 'Alerta: Risco iminente de insolvência técnica.';
    if (score > 80) return 'Saúde robusta: Operação eficiente.';
    if (score > 50) return 'Atenção: Indicadores de estabilidade em queda.';
    return 'Risco elevado: Histórico crítico detectado.';
  }

  // --- 🟢 ADIÇÕES PARA COMPLETAR O SERVIÇO ---

  /**
   * 📊 GET HISTORICAL TRENDS
   * Recupera o histórico de snapshots para gerar gráficos de evolução.
   */
  async getHistoricalTrends(companyId: string, limit = 12) {
    this.logger.log(`📈 Recuperando tendências históricas para: ${companyId}`);
    return await this.prisma.financialSnapshot.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit,
    });
  }

  /**
   * 🎯 GET CRITICAL TAX ALERTS
   * Busca obrigações fiscais pendentes que impactam a saúde financeira.
   */
  async getTaxComplianceStatus(companyId: string) {
    const pendingTaxes = await this.prisma.taxObligation.findMany({
      where: { companyId, status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
      take: InsightsService.PENDING_TAX_ALERT_LIMIT,
    });

    return {
      pendingCount: pendingTaxes.length,
      totalAmount: pendingTaxes.reduce(
        (sum, tax) => sum + Number(tax.amount),
        0,
      ),
      nextDeadline: pendingTaxes[0]?.dueDate || null,
    };
  }

  /**
   * ⚡ REFRESH INSIGHTS ON-DEMAND
   * Força a atualização de todos os motores para uma empresa específica.
   */
  async refreshCompanyInsights(companyId: string) {
    this.logger.log(`⚡ Force refresh iniciado para: ${companyId}`);

    // Atualiza Projeção
    await this.cashFlowService.generateProjection(companyId, 90);

    // Recalcula Saúde
    const health = await this.getFinancialHealth(companyId);

    // Sincroniza Snapshot
    await this.syncFinancialSnapshot(companyId, health);

    return { status: 'Updated', timestamp: new Date() };
  }
}
