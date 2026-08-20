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
  AccountType,
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

  async getManagementCockpit(companyId: string) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const yearStart = new Date(currentYear, 0, 1);
    const monthStart = new Date(currentYear, currentMonth - 1, 1);
    const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const [
      company,
      invoices,
      taxObligations,
      fiscalObligations,
      bankTransactions,
      accountingEntries,
      accountPlan,
      automationJobs,
      complianceChecks,
      financialSnapshots,
    ] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, settings: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          companyId,
          issuedAt: { gte: yearStart, lte: monthEnd },
        },
        select: {
          id: true,
          amount: true,
          taxAmount: true,
          issuedAt: true,
          reconciled: true,
          status: true,
        },
      }),
      this.prisma.taxObligation.findMany({
        where: { companyId },
        select: { id: true, amount: true, dueDate: true, status: true },
      }),
      this.prisma.fiscalObligation.findMany({
        where: { companyId },
        select: { id: true, status: true, dueDate: true, type: true },
      }),
      this.prisma.bankTransaction.findMany({
        where: { companyId, occurredAt: { gte: yearStart, lte: monthEnd } },
        select: {
          id: true,
          amount: true,
          type: true,
          occurredAt: true,
          reconciled: true,
          description: true,
        },
      }),
      this.prisma.accountingEntry.findMany({
        where: { companyId, year: currentYear },
        select: {
          id: true,
          amount: true,
          month: true,
          debitCode: true,
          creditCode: true,
          description: true,
        },
      }),
      this.prisma.accountPlan.findMany({
        where: { OR: [{ companyId }, { companyId: null }] },
        select: { code: true, name: true, type: true },
      }),
      this.prisma.automationJob.findMany({
        where: { companyId, createdAt: { gte: yearStart } },
        select: { id: true, status: true, name: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.complianceCheck.findMany({
        where: { companyId, resolved: false },
        select: {
          id: true,
          severity: true,
          checkName: true,
          description: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.financialSnapshot.findMany({
        where: { companyId, year: currentYear },
        select: {
          month: true,
          revenue: true,
          expenses: true,
          taxPayable: true,
          netProfit: true,
        },
        orderBy: { month: 'asc' },
      }),
    ]);

    if (!company) {
      throw new InternalServerErrorException(
        'Empresa não encontrada para o dashboard.',
      );
    }

    const accountByCode = new Map(
      accountPlan.map((account) => [account.code, account]),
    );
    const revenueYtd = this.sumMoney(invoices.map((invoice) => invoice.amount));
    const taxProvisionYtd = this.sumMoney(
      invoices.map((invoice) => invoice.taxAmount ?? 0),
    );
    const paidTaxesYtd = this.sumMoney(
      taxObligations
        .filter((item) => item.status === ObligationStatus.PAID)
        .map((item) => item.amount),
    );

    const cashInYtd = this.sumMoney(
      bankTransactions
        .filter((transaction) => transaction.type === 'CREDIT')
        .map((transaction) => transaction.amount),
    );
    const cashOutYtd = this.sumMoney(
      bankTransactions
        .filter((transaction) => transaction.type === 'DEBIT')
        .map((transaction) => transaction.amount),
    );
    const expenseEntries = accountingEntries.filter((entry) => {
      const debitAccount = accountByCode.get(entry.debitCode);
      return (
        debitAccount?.type === AccountType.DESPESA ||
        debitAccount?.type === AccountType.CUSTO
      );
    });
    const accountingExpensesYtd = this.sumMoney(
      expenseEntries.map((entry) => entry.amount),
    );
    const expensesYtd = accountingExpensesYtd || cashOutYtd + paidTaxesYtd;
    const grossMargin =
      revenueYtd > 0 ? ((revenueYtd - expensesYtd) / revenueYtd) * 100 : 0;
    const netIncome =
      revenueYtd - expensesYtd - Math.max(taxProvisionYtd - paidTaxesYtd, 0);

    const monthly = Array.from({ length: currentMonth }, (_, index) => {
      const month = index + 1;
      const monthRevenue = this.sumMoney(
        invoices
          .filter((invoice) => invoice.issuedAt.getMonth() + 1 === month)
          .map((invoice) => invoice.amount),
      );
      const monthCashIn = this.sumMoney(
        bankTransactions
          .filter(
            (transaction) =>
              transaction.type === 'CREDIT' &&
              transaction.occurredAt.getMonth() + 1 === month,
          )
          .map((transaction) => transaction.amount),
      );
      const monthCashOut = this.sumMoney(
        bankTransactions
          .filter(
            (transaction) =>
              transaction.type === 'DEBIT' &&
              transaction.occurredAt.getMonth() + 1 === month,
          )
          .map((transaction) => transaction.amount),
      );

      return {
        month,
        revenue: monthRevenue,
        cashIn: monthCashIn,
        cashOut: monthCashOut,
        netCash: monthCashIn - monthCashOut,
      };
    });

    const budget = this.readBudget(company.settings);
    const actualMonth = monthly.find((item) => item.month === currentMonth) ?? {
      revenue: 0,
      cashOut: 0,
      netCash: 0,
    };

    const costCenters = this.buildCostCenters(
      expenseEntries,
      accountByCode,
      budget.costCenters,
    );
    const reconciliationTotal = invoices.length + bankTransactions.length;
    const reconciliationDone =
      invoices.filter((invoice) => invoice.reconciled).length +
      bankTransactions.filter((transaction) => transaction.reconciled).length;
    const openFiscalObligations = fiscalObligations.filter(
      (item) => item.status !== 'ACCEPTED',
    ).length;

    return {
      company: { id: company.id, name: company.name },
      period: {
        year: currentYear,
        month: currentMonth,
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        revenueYtd: this.money(revenueYtd),
        expensesYtd: this.money(expensesYtd),
        netIncome: this.money(netIncome),
        grossMargin: this.money(grossMargin),
        cashInYtd: this.money(cashInYtd),
        cashOutYtd: this.money(cashOutYtd),
        netCashYtd: this.money(cashInYtd - cashOutYtd),
        reconciliationRate:
          reconciliationTotal > 0
            ? this.money((reconciliationDone / reconciliationTotal) * 100)
            : 100,
        openFiscalObligations,
        criticalIssues: complianceChecks.filter(
          (item) => item.severity === 'CRITICAL',
        ).length,
      },
      dre: {
        revenue: this.money(revenueYtd),
        taxes: this.money(Math.max(taxProvisionYtd, paidTaxesYtd)),
        operatingExpenses: this.money(expensesYtd),
        ebitda: this.money(revenueYtd - expensesYtd),
        netIncome: this.money(netIncome),
      },
      cashFlow: {
        monthly,
        projectedClosingCash: this.money(cashInYtd - cashOutYtd),
      },
      balance: {
        assets: this.money(cashInYtd + revenueYtd),
        liabilities: this.money(cashOutYtd + paidTaxesYtd),
        equity: this.money(revenueYtd - expensesYtd),
        snapshots: financialSnapshots.map((snapshot) => ({
          month: snapshot.month,
          revenue: this.toNumber(snapshot.revenue),
          expenses: this.toNumber(snapshot.expenses),
          taxPayable: this.toNumber(snapshot.taxPayable),
          netProfit: this.toNumber(snapshot.netProfit),
        })),
      },
      reconciliation: {
        invoices: {
          total: invoices.length,
          reconciled: invoices.filter((invoice) => invoice.reconciled).length,
          pending: invoices.filter((invoice) => !invoice.reconciled).length,
        },
        bankTransactions: {
          total: bankTransactions.length,
          reconciled: bankTransactions.filter(
            (transaction) => transaction.reconciled,
          ).length,
          pending: bankTransactions.filter(
            (transaction) => !transaction.reconciled,
          ).length,
        },
      },
      costCenters,
      budgetVsActual: {
        revenue: this.compareBudget(
          'Receita',
          budget.monthlyRevenue,
          actualMonth.revenue,
        ),
        expenses: this.compareBudget(
          'Despesas',
          budget.monthlyExpenses,
          actualMonth.cashOut,
        ),
        netCash: this.compareBudget(
          'Caixa líquido',
          budget.monthlyNetCash,
          actualMonth.netCash,
        ),
      },
      automation: {
        running: automationJobs.filter(
          (job) => job.status === JobStatus.RUNNING,
        ).length,
        failed: automationJobs.filter((job) => job.status === JobStatus.FAILED)
          .length,
        recent: automationJobs,
      },
      compliance: complianceChecks,
      assumptions: [
        'DRE, fluxo de caixa e balanço são consolidados gerenciais para cockpit executivo.',
        'Centro de custos usa contas contábeis de despesa/custo e pode ser refinado com Company.settings.budget.costCenters.',
        'Orçamento previsto lê Company.settings.budget quando configurado; caso contrário usa metas zeradas.',
      ],
    };
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

  private readBudget(settings: unknown) {
    const budget =
      settings && typeof settings === 'object' && 'budget' in settings
        ? (settings as { budget?: Record<string, unknown> }).budget
        : undefined;

    return {
      monthlyRevenue: this.safeNumber(budget?.monthlyRevenue),
      monthlyExpenses: this.safeNumber(budget?.monthlyExpenses),
      monthlyNetCash: this.safeNumber(budget?.monthlyNetCash),
      costCenters: Array.isArray(budget?.costCenters)
        ? (budget.costCenters as Array<{ name?: unknown; planned?: unknown }>)
        : [],
    };
  }

  private buildCostCenters(
    entries: Array<{ amount: unknown; debitCode: string; description: string }>,
    accountByCode: Map<string, { name: string }>,
    planned: Array<{ name?: unknown; planned?: unknown }>,
  ) {
    const plannedByName = new Map(
      planned
        .filter((item) => typeof item.name === 'string')
        .map((item) => [String(item.name), this.safeNumber(item.planned)]),
    );
    const grouped = new Map<string, number>();

    for (const entry of entries) {
      const accountName =
        accountByCode.get(entry.debitCode)?.name ||
        entry.description ||
        'Sem centro';
      grouped.set(
        accountName,
        (grouped.get(accountName) ?? 0) + this.toNumber(entry.amount),
      );
    }

    return Array.from(grouped.entries())
      .map(([name, actual]) => {
        const plannedValue = plannedByName.get(name) ?? 0;

        return {
          name,
          actual: this.money(actual),
          planned: this.money(plannedValue),
          variance: this.money(actual - plannedValue),
          usagePercent:
            plannedValue > 0 ? this.money((actual / plannedValue) * 100) : 0,
        };
      })
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 8);
  }

  private compareBudget(label: string, planned: number, actual: number) {
    return {
      label,
      planned: this.money(planned),
      actual: this.money(actual),
      variance: this.money(actual - planned),
      achievement: planned > 0 ? this.money((actual / planned) * 100) : 0,
    };
  }

  private safeNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toNumber(value: unknown): number {
    if (value && typeof value === 'object' && 'toNumber' in value) {
      return Number((value as { toNumber: () => number }).toNumber());
    }

    return this.safeNumber(value);
  }

  private sumMoney(values: unknown[]): number {
    return values.reduce<number>((sum, value) => sum + this.toNumber(value), 0);
  }

  private money(value: number): number {
    return Number(value.toFixed(2));
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
