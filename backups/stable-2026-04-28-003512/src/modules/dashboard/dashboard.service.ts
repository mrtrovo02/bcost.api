'use strict';

// =============================================================================
// ARQUIVO: src/modules/dashboard/dashboard.service.ts
// =============================================================================

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  JobStatus,
  ObligationStatus,
  ComplianceStatus,
  NotificationSeverity,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { InsightsService } from '../../insights/insights.service.js';
import { CashFlowProjectionService } from '../../insights/cash-flow-projection/cash-flow-projection.service.js';
import { AnomalyDetectionService } from '../../insights/anomaly-detection/anomaly-detection.service.js';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly insightsService: InsightsService,
    private readonly cashFlowService: CashFlowProjectionService,
    private readonly anomalyService: AnomalyDetectionService,
  ) {}

  // ---------------------------------------------------------------------------
  // VISÃO 360° — Cockpit Principal
  // ---------------------------------------------------------------------------

  /**
   * Consolidado principal do Dashboard bCost.
   *
   * Executa 7 queries em paralelo via Promise.all para latência mínima.
   * Cada bloco alimenta um widget diferente no frontend (Recharts).
   *
   * FIX: removido `private readonly db: PrismaClient` (shadow casting).
   * O cast `prisma as unknown as PrismaClient` contornava erros de tipagem
   * mas bypassava as extensões de multi-tenancy e soft-delete do PrismaService.
   * Agora usa `this.prisma` diretamente — as extensões aplicam os filtros
   * de companyId e deletedAt automaticamente em todas as queries.
   */
  async getCompanyOverview(companyId: string) {
    this.logger.log(
      `[Dashboard] Gerando visão geral 360º para empresa: ${companyId}`,
    );

    try {
      const [
        healthScore,
        revenueHistory,
        pendingJobs,
        recentLogs,
        financialHealth,
        anomalies,
        projections,
      ] = await Promise.all([
        this.analyticsService.getFiscalHealthScore(companyId),
        this.analyticsService.getRevenueHistory(companyId),

        this.prisma.automationJob.count({
          where: { companyId, status: JobStatus.RUNNING },
        }),

        this.prisma.auditLog.findMany({
          where: { companyId },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { action: true, createdAt: true, module: true },
        }),

        this.insightsService.getFinancialHealth(companyId),
        this.anomalyService.detectAnomalies(companyId),
        this.cashFlowService.getLatestProjection(companyId),
      ]);

      const currentYear = new Date().getUTCFullYear();

      // YTD — faturamento acumulado no ano corrente
      const ytdRevenue = await this.prisma.invoice.aggregate({
        where: {
          companyId,
          issuedAt: {
            gte: new Date(new Date().getUTCFullYear(), 0, 1),
          },
        },
        _sum: { amount: true },
      });

      // Obrigações fiscais vencidas — alerta crítico para o contador
      const overdueObligations = await this.prisma.taxObligation.count({
        where: { companyId, status: ObligationStatus.OVERDUE },
      });

      // Notas pendentes de reconciliação — diferencial vs players legados
      const unreconciledInvoices = await this.prisma.invoice.count({
        where: { companyId, reconciled: false },
      });

      return {
        summary: {
          fiscalScore: healthScore,
          financialScore: financialHealth.score,
          totalRevenueYTD: ytdRevenue._sum.amount?.toNumber() ?? 0,
          activeAutomations: pendingJobs,
          criticalAnomalies: anomalies.filter(
            (a: { deviationScore: number }) => a.deviationScore > 2.0,
          ).length,
          // NOVO: alertas que o contador abre o sistema para ver todo dia
          overdueObligations,
          unreconciledInvoices,
        },
        revenueChart: revenueHistory,
        cashFlowProjection: Array.isArray(projections)
          ? projections.slice(0, 30)
          : [],
        activityFeed: recentLogs.map((log) => ({
          ...log,
          description: `${log.module}: ${log.action.replace(/_/g, ' ')}`,
        })),
        engineStatus: {
          status: financialHealth.status,
          lastAnalysis: new Date(),
        },
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Dashboard Critical] Erro ao consolidar dados: ${message}`,
      );
      throw new InternalServerErrorException(
        'Erro ao processar indicadores do dashboard.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // ALERTAS FINANCEIROS — Vencimentos próximos
  // ---------------------------------------------------------------------------

  /**
   * Obrigações fiscais vencendo nos próximos N dias.
   * Padrão: 5 dias — alinhado ao prazo mínimo para gerar DAS no Simples Nacional.
   *
   * NOVO: inclui obrigações OVERDUE para o contador ver o que já venceu sem pagar.
   */
  async getFinancialAlerts(companyId: string, days = 5) {
    const today = new Date();
    const horizonDate = new Date();
    horizonDate.setDate(today.getDate() + days);

    const [urgentObligations, overdueObligations, expiringCerts] =
      await Promise.all([
        // Vencendo em breve
        this.prisma.taxObligation.findMany({
          where: {
            companyId,
            status: ObligationStatus.PENDING,
            dueDate: { gte: today, lte: horizonDate },
          },
          orderBy: { dueDate: 'asc' },
        }),

        // Já vencidas (crítico — multa e juros acumulando)
        this.prisma.taxObligation.findMany({
          where: {
            companyId,
            status: ObligationStatus.OVERDUE,
          },
          orderBy: { dueDate: 'asc' },
          take: 10,
        }),

        // Certificados digitais expirando em 30 dias
        this.prisma.digitalCertificate.findMany({
          where: {
            companyId,
            validTo: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
            status: 'ACTIVE',
          },
          select: { id: true, issuer: true, validTo: true },
        }),
      ]);

    const formatObligation = (ob: (typeof urgentObligations)[0]) => ({
      id: ob.id,
      name: ob.name,
      amount: ob.amount.toNumber(),
      dueDate: ob.dueDate,
      status: ob.status,
      daysRemaining: Math.ceil(
        (ob.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      ),
    });

    return {
      upcoming: urgentObligations.map(formatObligation),
      overdue: overdueObligations.map(formatObligation),
      certificates: expiringCerts.map((cert) => ({
        id: cert.id,
        issuer: cert.issuer,
        validTo: cert.validTo,
        daysToExpiry: Math.ceil(
          (cert.validTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        ),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // MÉTRICAS EM TEMPO REAL — Mês corrente
  // ---------------------------------------------------------------------------

  /**
   * KPIs do mês corrente para o widget de processamento ao vivo.
   * Inclui provisão de imposto e contagem de notas — base para o DAS estimado.
   */
  async getRealTimeMetrics(companyId: string) {
    this.logger.debug(
      `[Dashboard] Capturando métricas de processamento vivo: ${companyId}`,
    );

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [invoicesCount, taxEstimate, payrollCount, reconciledCount] =
      await Promise.all([
        this.prisma.invoice.count({
          where: { companyId, issuedAt: { gte: startOfMonth } },
        }),
        this.prisma.taxCalculation.aggregate({
          where: { companyId, month: currentMonth, year: currentYear },
          _sum: { totalAmount: true },
        }),
        // Folhas lançadas no mês — confirma se o Fator R está alimentado
        this.prisma.payroll.count({
          where: { companyId, month: currentMonth, year: currentYear },
        }),
        // Taxa de conciliação do mês — KPI de saúde operacional
        this.prisma.invoice.count({
          where: {
            companyId,
            issuedAt: { gte: startOfMonth },
            reconciled: true,
          },
        }),
      ]);

    const reconciliationRate =
      invoicesCount > 0
        ? Number(((reconciledCount / invoicesCount) * 100).toFixed(1))
        : 100;

    return {
      monthReference: currentMonth,
      year: currentYear,
      processedInvoices: invoicesCount,
      reconciledInvoices: reconciledCount,
      reconciliationRate,
      estimatedTaxProvision: taxEstimate._sum.totalAmount?.toNumber() ?? 0,
      payrollRegistered: payrollCount > 0,
      engineStatus: 'STABLE',
    };
  }

  // ---------------------------------------------------------------------------
  // DIAGNÓSTICO DE COMPLIANCE
  // ---------------------------------------------------------------------------

  /**
   * Score de compliance ponderado por severidade.
   * Algoritmo: começa em 100, desconta 20 pts por CRITICAL e 5 pts por WARNING/INFO.
   * Score < 60 = status CRITICAL no dashboard (bloqueia ações no frontend).
   *
   * NOVO: inclui breakdown por categoria e issues IN_PROGRESS para o contador
   * saber o que já está sendo tratado.
   */
  async getComplianceDiagnostic(companyId: string) {
    const [openIssues, inProgressIssues, resolvedThisMonth] = await Promise.all(
      [
        this.prisma.complianceCheck.findMany({
          where: {
            companyId,
            status: ComplianceStatus.OPEN,
            resolved: false,
          },
          orderBy: { severity: 'desc' },
        }),

        this.prisma.complianceCheck.findMany({
          where: {
            companyId,
            status: ComplianceStatus.IN_PROGRESS,
            resolved: false,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),

        // Resolvidos no mês corrente — mostra progresso para o cliente
        this.prisma.complianceCheck.count({
          where: {
            companyId,
            status: ComplianceStatus.RESOLVED,
            resolvedAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      ],
    );

    // Score ponderado por severidade
    const score = openIssues.reduce((acc, curr) => {
      const penalty =
        curr.severity === NotificationSeverity.CRITICAL
          ? 20
          : curr.severity === NotificationSeverity.WARNING
            ? 5
            : 2;
      return Math.max(0, acc - penalty);
    }, 100);

    const complianceStatus =
      score >= 80 ? 'HEALTHY' : score >= 50 ? 'WARNING' : 'CRITICAL';

    return {
      complianceScore: score,
      status: complianceStatus,
      issuesFound: openIssues.length,
      inProgress: inProgressIssues.length,
      resolvedThisMonth,
      criticalBlockers: openIssues.filter(
        (f) => f.severity === NotificationSeverity.CRITICAL,
      ).length,
      details: openIssues.map((f) => ({
        id: f.id,
        check: f.checkName,
        impact: f.severity,
        message: f.description,
        since: f.createdAt,
      })),
      inProgressDetails: inProgressIssues.map((f) => ({
        id: f.id,
        check: f.checkName,
      })),
    };
  }
}
