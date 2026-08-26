'use strict';

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditIntelligenceEnterpriseService } from '../audit-intelligence-enterprise/audit-intelligence-enterprise.service.js';
import { FinanceOperationsEnterpriseService } from '../finance-operations-enterprise/finance-operations-enterprise.service.js';
import { CommandCenterQueryDto } from './dto/command-center-query.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type ModelMetric = {
  slug: string;
  label: string;
  prismaKey: string;
  available: boolean;
  total: number;
  active?: number;
  pending?: number;
  critical?: number;
  warning?: number;
  failed?: number;
  open?: number;
  resolved?: number;
  unread?: number;
  riskScore: number;
  status: 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'UNAVAILABLE';
  sample?: unknown[];
  error?: string;
};

type ExecutiveRisk = {
  slug: string;
  title: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  scoreImpact: number;
  description: string;
  evidence?: Record<string, unknown>;
};

@Injectable()
export class CommandCenterEnterpriseService {
  private readonly logger = new Logger(CommandCenterEnterpriseService.name);

  private readonly commandCenterCache = new Map<
    string,
    {
      expiresAt: number;
      payload: Record<string, unknown>;
    }
  >();

  private readonly COMMAND_CENTER_CACHE_TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditIntelligenceService: AuditIntelligenceEnterpriseService,
    private readonly financeOperationsService: FinanceOperationsEnterpriseService,
  ) {}

  private buildCommandCenterCacheKey(
    scope: string,
    companyId: string,
    query: any,
  ) {
    return [
      `command-center-${scope}`,
      companyId,
      `limit=${query?.limit ?? 10}`,
      `includeAudit=${query?.includeAudit ?? 'false'}`,
      `includeHealth=${query?.includeHealth ?? 'true'}`,
      `includeSamples=${query?.includeSamples ?? 'false'}`,
    ].join('|');
  }

  private getCommandCenterCache(key: string) {
    const cached = this.commandCenterCache.get(key);

    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.commandCenterCache.delete(key);
      return null;
    }

    return cached.payload;
  }

  private setCommandCenterCache(key: string, payload: Record<string, unknown>) {
    if (this.commandCenterCache.size > 100) {
      const firstKey = this.commandCenterCache.keys().next().value;

      if (firstKey) {
        this.commandCenterCache.delete(firstKey);
      }
    }

    this.commandCenterCache.set(key, {
      expiresAt: Date.now() + this.COMMAND_CENTER_CACHE_TTL_MS,
      payload,
    });
  }

  private getUserId(user?: AuthUser): string | null {
    return user?.id || user?.sub || null;
  }

  private validateCompanyAccess(companyId: string, user?: AuthUser) {
    const tokenCompanyId = user?.companyId;
    const role = String(user?.role || '').toUpperCase();

    if (!tokenCompanyId) return;

    const elevatedRoles = ['SUPER_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'];

    if (tokenCompanyId !== companyId && !elevatedRoles.includes(role)) {
      throw new ForbiddenException(
        'Acesso negado: empresa do token não corresponde à empresa solicitada.',
      );
    }
  }

  private async ensureCompany(companyId: string) {
    const companyModel = (this.prisma as any).company;

    if (!companyModel?.findFirst && !companyModel?.findUnique) {
      throw new NotFoundException('Modelo Prisma company não encontrado.');
    }

    const attempts: Array<{
      label: string;
      run: () => Promise<unknown>;
    }> = [
      {
        label: 'findFirst-id-only',
        run: () =>
          companyModel.findFirst({
            where: {
              id: companyId,
            },
          }),
      },
      {
        label: 'findUnique-id',
        run: () =>
          companyModel.findUnique({
            where: {
              id: companyId,
            },
          }),
      },
      {
        label: 'findFirst-id-not-deleted',
        run: () =>
          companyModel.findFirst({
            where: {
              id: companyId,
              deletedAt: null,
            },
          }),
      },
      {
        label: 'findFirst-minimal-select',
        run: () =>
          companyModel.findFirst({
            where: {
              id: companyId,
            },
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          }),
      },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        const company = await attempt.run();

        if (company) {
          return this.normalize(company);
        }
      } catch (error) {
        errors.push(
          `[${attempt.label}] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.warn(
      `[CommandCenterEnterprise] Empresa não localizada ou consulta incompatível: ${errors.join(' | ')}`,
    );

    throw new NotFoundException(`Empresa não encontrada: ${companyId}`);
  }

  private normalize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.normalize(item));
    }

    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};

      for (const [key, inner] of Object.entries(value)) {
        out[key] = this.normalize(inner);
      }

      return out;
    }

    return value;
  }

  private getModel(prismaKey: string): any | null {
    const model = (this.prisma as any)[prismaKey];

    if (!model?.findMany || !model?.count) {
      return null;
    }

    return model;
  }

  private async countSafe(
    prismaKey: string,
    where: Record<string, unknown>,
  ): Promise<number> {
    const model = this.getModel(prismaKey);

    if (!model) return 0;

    const attempts = [where, { companyId: where.companyId }, {}];

    for (const attempt of attempts) {
      try {
        return await model.count({ where: attempt });
      } catch {
        continue;
      }
    }

    return 0;
  }

  private async sampleSafe(
    prismaKey: string,
    where: Record<string, unknown>,
    limit: number,
  ): Promise<unknown[]> {
    const model = this.getModel(prismaKey);

    if (!model) return [];

    const attempts = [where, { companyId: where.companyId }, {}];

    for (const attempt of attempts) {
      try {
        const rows = await model.findMany({
          where: attempt,
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        return this.normalize(rows) as unknown[];
      } catch {
        try {
          const rows = await model.findMany({
            where: attempt,
            take: limit,
          });

          return this.normalize(rows) as unknown[];
        } catch {
          continue;
        }
      }
    }

    return [];
  }

  private async countByFieldSafe(params: {
    prismaKey: string;
    companyId: string;
    field: string;
    values: string[];
  }): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const model = this.getModel(params.prismaKey);

    for (const value of params.values) {
      result[value] = 0;
    }

    if (!model) return result;

    for (const value of params.values) {
      const where = {
        companyId: params.companyId,
        [params.field]: value,
      };

      try {
        result[value] = await model.count({ where });
      } catch {
        result[value] = 0;
      }
    }

    return result;
  }

  private modelCatalog() {
    return [
      {
        slug: 'automation-jobs',
        label: 'Automation Jobs',
        prismaKey: 'automationJob',
        riskField: 'status',
        criticalValues: ['FAILED'],
        warningValues: ['RETRY', 'PENDING'],
      },
      {
        slug: 'notifications',
        label: 'Notifications',
        prismaKey: 'notificationLog',
        riskField: 'severity',
        criticalValues: ['CRITICAL'],
        warningValues: ['WARNING'],
      },
      {
        slug: 'webhooks',
        label: 'Webhooks',
        prismaKey: 'webhookConfig',
        riskField: 'active',
        criticalValues: [],
        warningValues: ['false'],
      },
      {
        slug: 'audit-logs',
        label: 'AuditLog',
        prismaKey: 'auditLog',
        riskField: 'statusCode',
        criticalValues: ['500'],
        warningValues: ['400', '401', '404', '422'],
      },
      {
        slug: 'compliance-checks',
        label: 'Compliance Checks',
        prismaKey: 'complianceCheck',
        riskField: 'severity',
        criticalValues: ['CRITICAL'],
        warningValues: ['WARNING'],
      },
      {
        slug: 'business-rules',
        label: 'Business Rules',
        prismaKey: 'businessRule',
        riskField: 'enabled',
        criticalValues: [],
        warningValues: ['false'],
      },
      {
        slug: 'digital-certificates',
        label: 'Digital Certificates',
        prismaKey: 'digitalCertificate',
        riskField: 'status',
        criticalValues: ['EXPIRED', 'REVOKED'],
        warningValues: ['EXPIRING_SOON'],
      },
      {
        slug: 'tax-obligations',
        label: 'Tax Obligations',
        prismaKey: 'taxObligation',
        riskField: 'status',
        criticalValues: ['OVERDUE'],
        warningValues: ['PENDING', 'PARTIAL'],
      },
      {
        slug: 'fiscal-obligations',
        label: 'Fiscal Obligations',
        prismaKey: 'fiscalObligation',
        riskField: 'status',
        criticalValues: ['OVERDUE', 'REJECTED'],
        warningValues: ['PENDING', 'GENERATED', 'SUBMITTED'],
      },
      {
        slug: 'account-plan',
        label: 'Account Plan',
        prismaKey: 'accountPlan',
        riskField: 'active',
        criticalValues: [],
        warningValues: ['false'],
      },
      {
        slug: 'accounting-entries',
        label: 'Accounting Entries',
        prismaKey: 'accountingEntry',
        riskField: 'status',
        criticalValues: ['ERROR', 'REJECTED'],
        warningValues: ['DRAFT', 'PENDING'],
      },
      {
        slug: 'bank-accounts',
        label: 'Bank Accounts',
        prismaKey: 'bankAccount',
        riskField: 'active',
        criticalValues: [],
        warningValues: ['false'],
      },
      {
        slug: 'bank-transactions',
        label: 'Bank Transactions',
        prismaKey: 'bankTransaction',
        riskField: 'status',
        criticalValues: ['FAILED', 'ERROR'],
        warningValues: ['PENDING', 'UNRECONCILED'],
      },
      {
        slug: 'employees',
        label: 'Employees',
        prismaKey: 'employee',
        riskField: 'status',
        criticalValues: [],
        warningValues: ['INACTIVE'],
      },
      {
        slug: 'payrolls',
        label: 'Payrolls',
        prismaKey: 'payroll',
        riskField: 'status',
        criticalValues: ['FAILED', 'REJECTED'],
        warningValues: ['DRAFT', 'PENDING'],
      },
      {
        slug: 'invoices',
        label: 'Invoices',
        prismaKey: 'invoice',
        riskField: 'status',
        criticalValues: ['REJECTED', 'CANCELLED'],
        warningValues: ['PENDING', 'PROCESSING'],
      },
      {
        slug: 'financial-events',
        label: 'Financial Events',
        prismaKey: 'financialEvent',
        riskField: 'status',
        criticalValues: ['OVERDUE', 'FAILED'],
        warningValues: ['PENDING'],
      },
      {
        slug: 'companies',
        label: 'Companies',
        prismaKey: 'company',
        riskField: 'status',
        criticalValues: ['BLOCKED', 'SUSPENDED'],
        warningValues: ['INACTIVE'],
      },
      {
        slug: 'users',
        label: 'Users',
        prismaKey: 'user',
        riskField: 'status',
        criticalValues: ['BLOCKED'],
        warningValues: ['INACTIVE'],
      },
    ];
  }

  private calculateModuleStatus(params: {
    total: number;
    critical: number;
    warning: number;
    failed: number;
    available: boolean;
  }): {
    riskScore: number;
    status: 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'UNAVAILABLE';
  } {
    if (!params.available) {
      return {
        riskScore: 0,
        status: 'UNAVAILABLE',
      };
    }

    const penalty =
      params.critical * 15 + params.failed * 12 + params.warning * 6;

    const riskScore = Math.max(0, Math.min(100, 100 - penalty));

    if (riskScore < 60 || params.critical > 0 || params.failed > 3) {
      return {
        riskScore,
        status: 'CRITICAL',
      };
    }

    if (riskScore < 85 || params.warning > 0 || params.failed > 0) {
      return {
        riskScore,
        status: 'ATTENTION',
      };
    }

    return {
      riskScore,
      status: 'HEALTHY',
    };
  }

  private collectRisks(metrics: ModelMetric[]): ExecutiveRisk[] {
    const risks: ExecutiveRisk[] = [];

    for (const metric of metrics) {
      if (!metric.available) {
        risks.push({
          slug: metric.slug,
          title: `${metric.label} indisponível no Prisma Client`,
          severity: 'WARNING',
          scoreImpact: 5,
          description:
            'O módulo está registrado no Command Center, mas o model não está disponível no Prisma Client atual.',
          evidence: {
            prismaKey: metric.prismaKey,
          },
        });

        continue;
      }

      if (metric.status === 'CRITICAL') {
        risks.push({
          slug: metric.slug,
          title: `${metric.label} em estado crítico`,
          severity: 'CRITICAL',
          scoreImpact: 15,
          description:
            'Foram encontrados registros críticos, falhos ou indicadores que exigem intervenção imediata.',
          evidence: {
            total: metric.total,
            critical: metric.critical,
            failed: metric.failed,
            warning: metric.warning,
            riskScore: metric.riskScore,
          },
        });
      } else if (metric.status === 'ATTENTION') {
        risks.push({
          slug: metric.slug,
          title: `${metric.label} requer atenção`,
          severity: 'WARNING',
          scoreImpact: 6,
          description:
            'Existem pendências, alertas ou sinais operacionais que devem ser acompanhados.',
          evidence: {
            total: metric.total,
            warning: metric.warning,
            failed: metric.failed,
            riskScore: metric.riskScore,
          },
        });
      }
    }

    return risks.sort((a, b) => b.scoreImpact - a.scoreImpact);
  }

  private normalizeAuditStatus(
    status?: string,
  ): 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'UNAVAILABLE' {
    const normalized = String(status || '').toUpperCase();

    if (normalized === 'HEALTHY') return 'HEALTHY';
    if (normalized === 'ATTENTION') return 'ATTENTION';
    if (normalized === 'CRITICAL') return 'CRITICAL';

    return 'UNAVAILABLE';
  }

  private async getAuditIntelligenceSignal(companyId: string, user?: AuthUser) {
    try {
      const payload = (await this.auditIntelligenceService.executive(
        companyId,
        {
          lookback: 300,
          limit: 10,
          includeRecommendations: 'true',
        } as any,
        user,
      )) as any;

      return {
        available: true,
        payload,
        quality: payload?.quality || null,
        findings: Array.isArray(payload?.findings) ? payload.findings : [],
        recommendations: Array.isArray(payload?.recommendations)
          ? payload.recommendations
          : [],
        route: '/dashboard/modules/audit-intelligence',
        apiBase: '/audit/intelligence',
      };
    } catch (error) {
      this.logger.warn(
        `[CommandCenterEnterprise] Audit Intelligence indisponível: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        available: false,
        payload: null,
        quality: null,
        findings: [],
        recommendations: [],
        route: '/dashboard/modules/audit-intelligence',
        apiBase: '/audit/intelligence',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildAuditIntelligenceMetric(auditSignal: any): ModelMetric {
    if (!auditSignal?.available || !auditSignal?.quality) {
      return {
        slug: 'audit-intelligence',
        label: 'Audit Intelligence',
        prismaKey: 'auditLog',
        available: false,
        total: 0,
        critical: 0,
        warning: 0,
        failed: 0,
        riskScore: 0,
        status: 'UNAVAILABLE',
        error: auditSignal?.error || 'Audit Intelligence indisponível',
      };
    }

    const quality = auditSignal.quality;
    const status = this.normalizeAuditStatus(quality.qualityStatus);

    return {
      slug: 'audit-intelligence',
      label: 'Audit Intelligence',
      prismaKey: 'auditLog',
      available: true,
      total: Number(quality.recordsAnalyzed || 0),
      critical: Number(quality.criticalEvents || quality.serverErrors || 0),
      warning: Number(quality.warningEvents || quality.clientErrors || 0),
      failed: Number(quality.serverErrors || 0),
      open: Number(quality.activeSignals || 0),
      resolved: Number(quality.historicalNoise || 0),
      riskScore: Number(quality.qualityScore || 0),
      status,
      sample: [],
    };
  }

  private slimAuditIntelligenceFindings(findings: any[]) {
    if (!Array.isArray(findings)) return [];

    return findings.slice(0, 5).map((finding) => ({
      id: finding?.id || null,
      severity: finding?.severity || null,
      title: finding?.title || null,
      count: Number(finding?.count || 0),
      evidenceSummary: {
        byModule: Array.isArray(finding?.evidenceSummary?.byModule)
          ? finding.evidenceSummary.byModule.slice(0, 3)
          : [],
        byAction: Array.isArray(finding?.evidenceSummary?.byAction)
          ? finding.evidenceSummary.byAction.slice(0, 3)
          : [],
        byEndpoint: Array.isArray(finding?.evidenceSummary?.byEndpoint)
          ? finding.evidenceSummary.byEndpoint.slice(0, 3)
          : [],
        latestSummaryCount: Array.isArray(
          finding?.evidenceSummary?.latestSummary,
        )
          ? finding.evidenceSummary.latestSummary.length
          : 0,
      },
    }));
  }

  private slimAuditIntelligenceRecommendations(recommendations: any[]) {
    if (!Array.isArray(recommendations)) return [];

    return recommendations.slice(0, 5).map((recommendation) => ({
      id: recommendation?.id || null,
      priority: recommendation?.priority || null,
      title: recommendation?.title || null,
      action: recommendation?.action || null,
    }));
  }

  private dedupeRisks(risks: ExecutiveRisk[]) {
    const bySlug = new Map<string, ExecutiveRisk>();

    const severityWeight: Record<string, number> = {
      INFO: 1,
      WARNING: 2,
      CRITICAL: 3,
    };

    for (const risk of risks) {
      const current = bySlug.get(risk.slug);

      if (!current) {
        bySlug.set(risk.slug, risk);
        continue;
      }

      const currentWeight = severityWeight[current.severity] || 0;
      const nextWeight = severityWeight[risk.severity] || 0;

      const shouldReplace =
        nextWeight > currentWeight ||
        (nextWeight === currentWeight &&
          Number(risk.scoreImpact || 0) > Number(current.scoreImpact || 0));

      if (shouldReplace) {
        bySlug.set(risk.slug, risk);
      }
    }

    return Array.from(bySlug.values()).sort(
      (a, b) => Number(b.scoreImpact || 0) - Number(a.scoreImpact || 0),
    );
  }

  private buildAuditIntelligenceRisk(auditSignal: any): ExecutiveRisk | null {
    if (!auditSignal?.available || !auditSignal?.quality) {
      return {
        slug: 'audit-intelligence',
        title: 'Audit Intelligence indisponível',
        severity: 'WARNING',
        scoreImpact: 8,
        description:
          'O Command Center não conseguiu carregar a inteligência de auditoria. A visão executiva continua disponível, mas sem o sinal de qualidade operacional.',
        evidence: {
          route: auditSignal?.route,
          apiBase: auditSignal?.apiBase,
          error: auditSignal?.error,
        },
      };
    }

    const quality = auditSignal.quality;
    const status = String(quality.qualityStatus || '').toUpperCase();

    if (status !== 'CRITICAL' && status !== 'ATTENTION') {
      return null;
    }

    const isCritical = status === 'CRITICAL';

    return {
      slug: 'audit-intelligence',
      title: isCritical
        ? 'Audit Intelligence crítico'
        : 'Audit Intelligence requer atenção',
      severity: isCritical ? 'CRITICAL' : 'WARNING',
      scoreImpact: isCritical ? 18 : 10,
      description:
        'A camada de auditoria operacional identificou sinais que impactam a governança executiva do produto. Revise activeSignals, historicalNoise, serverErrors e clientErrors no módulo Audit Intelligence.',
      evidence: {
        quality: {
          qualityScore: Number(quality.qualityScore || 0),
          qualityStatus: quality.qualityStatus || 'UNAVAILABLE',
          recordsAnalyzed: Number(quality.recordsAnalyzed || 0),
          activeSignals: Number(quality.activeSignals || 0),
          historicalNoise: Number(quality.historicalNoise || 0),
          serverErrors: Number(quality.serverErrors || 0),
          clientErrors: Number(quality.clientErrors || 0),
          criticalEvents: Number(quality.criticalEvents || 0),
          warningEvents: Number(quality.warningEvents || 0),
        },
        findings: this.slimAuditIntelligenceFindings(auditSignal.findings),
        recommendations: this.slimAuditIntelligenceRecommendations(
          auditSignal.recommendations,
        ),
        route: auditSignal.route,
        apiBase: auditSignal.apiBase,
      },
    };
  }

  private enrichExecutiveSummaryWithAuditIntelligence(
    executiveSummary: any,
    auditSignal: any,
  ) {
    if (!auditSignal?.available || !auditSignal?.quality) {
      return {
        ...executiveSummary,
        auditQualityScore: null,
        auditQualityStatus: 'UNAVAILABLE',
        auditActiveSignals: 0,
        auditHistoricalNoise: 0,
        auditServerErrors: 0,
        auditClientErrors: 0,
      };
    }

    const quality = auditSignal.quality;
    const auditQualityScore = Number(quality.qualityScore || 0);
    const auditStatus = this.normalizeAuditStatus(quality.qualityStatus);

    const penalty =
      auditStatus === 'CRITICAL' ? 8 : auditStatus === 'ATTENTION' ? 4 : 0;

    const executiveScore = Math.max(
      0,
      Math.min(100, Number(executiveSummary.executiveScore || 0) - penalty),
    );

    const executiveStatus =
      executiveScore < 60 || auditStatus === 'CRITICAL'
        ? 'CRITICAL'
        : executiveScore < 85 || auditStatus === 'ATTENTION'
          ? 'ATTENTION'
          : executiveSummary.executiveStatus;

    return {
      ...executiveSummary,
      executiveScore,
      executiveStatus,
      auditQualityScore,
      auditQualityStatus: auditStatus,
      auditActiveSignals: Number(quality.activeSignals || 0),
      auditHistoricalNoise: Number(quality.historicalNoise || 0),
      auditServerErrors: Number(quality.serverErrors || 0),
      auditClientErrors: Number(quality.clientErrors || 0),
    };
  }

  private normalizeFinanceStatus(
    status?: string,
  ): 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'UNAVAILABLE' {
    const normalized = String(status || '').toUpperCase();

    if (normalized === 'HEALTHY') return 'HEALTHY';
    if (normalized === 'ATTENTION') return 'ATTENTION';
    if (normalized === 'CRITICAL') return 'CRITICAL';

    return 'UNAVAILABLE';
  }

  private async getFinanceOperationsSignal(companyId: string, user?: AuthUser) {
    try {
      const payload = (await this.financeOperationsService.summary(
        companyId,
        {
          limit: 50,
          includeRaw: 'false',
        } as any,
        user,
      )) as any;

      return {
        available: true,
        payload,
        executiveSummary: payload?.executiveSummary || null,
        route: '/dashboard/modules/finance-operations',
        apiBase: '/finance/operations',
      };
    } catch (error) {
      this.logger.warn(
        `[CommandCenterEnterprise] Finance Operations indisponível: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        available: false,
        payload: null,
        executiveSummary: null,
        route: '/dashboard/modules/finance-operations',
        apiBase: '/finance/operations',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildFinanceOperationsMetric(financeSignal: any): ModelMetric {
    if (!financeSignal?.available || !financeSignal?.executiveSummary) {
      return {
        slug: 'finance-operations',
        label: 'Finance Operations',
        prismaKey: 'financialEvent',
        available: false,
        total: 0,
        critical: 0,
        warning: 0,
        failed: 0,
        riskScore: 0,
        status: 'UNAVAILABLE',
        error: financeSignal?.error || 'Finance Operations indisponível',
      };
    }

    const summary = financeSignal.executiveSummary;
    const cashflow = summary.cashflow || {};
    const status = this.normalizeFinanceStatus(summary.financeStatus);

    return {
      slug: 'finance-operations',
      label: 'Finance Operations',
      prismaKey: 'financialEvent',
      available: true,
      total:
        Number(summary.receivables?.count || 0) +
        Number(summary.payables?.count || 0),
      critical: Number(summary.totalOverdueCount || 0),
      warning:
        String(cashflow.riskStatus || '').toUpperCase() === 'ATTENTION' ? 1 : 0,
      failed:
        String(cashflow.riskStatus || '').toUpperCase() === 'CRITICAL' ? 1 : 0,
      open:
        Number(summary.receivables?.openCount || 0) +
        Number(summary.payables?.openCount || 0),
      resolved:
        Number(summary.receivables?.settledCount || 0) +
        Number(summary.payables?.settledCount || 0),
      riskScore: Number(summary.financeScore || 0),
      status,
      sample: [],
    };
  }

  private buildFinanceOperationsRisk(financeSignal: any): ExecutiveRisk | null {
    if (!financeSignal?.available || !financeSignal?.executiveSummary) {
      return {
        slug: 'finance-operations',
        title: 'Finance Operations indisponível',
        severity: 'WARNING',
        scoreImpact: 8,
        description:
          'O Command Center não conseguiu carregar o sinal financeiro operacional. A visão executiva continua disponível, mas sem análise de cashflow, vencidos e exposição financeira.',
        evidence: {
          route: financeSignal?.route,
          apiBase: financeSignal?.apiBase,
          error: financeSignal?.error,
        },
      };
    }

    const summary = financeSignal.executiveSummary;
    const cashflow = summary.cashflow || {};
    const financeStatus = String(summary.financeStatus || '').toUpperCase();
    const cashflowRisk = String(cashflow.riskStatus || '').toUpperCase();
    const totalOverdueAmount = Number(summary.totalOverdueAmount || 0);
    const totalOverdueCount = Number(summary.totalOverdueCount || 0);
    const projectedNet = Number(cashflow.projectedNet || 0);

    if (
      financeStatus !== 'CRITICAL' &&
      financeStatus !== 'ATTENTION' &&
      cashflowRisk !== 'CRITICAL' &&
      cashflowRisk !== 'ATTENTION' &&
      totalOverdueAmount <= 0
    ) {
      return null;
    }

    const isCritical =
      financeStatus === 'CRITICAL' ||
      cashflowRisk === 'CRITICAL' ||
      projectedNet < 0 ||
      totalOverdueAmount >= 10000;

    return {
      slug: 'finance-operations',
      title: isCritical
        ? 'Risco financeiro crítico'
        : 'Finance Operations requer atenção',
      severity: isCritical ? 'CRITICAL' : 'WARNING',
      scoreImpact: isCritical ? 18 : 10,
      description:
        'A camada financeira identificou sinais que podem impactar caixa, recebíveis, pagáveis e previsibilidade operacional. Revise vencidos, saldo projetado e risco de cashflow no módulo Finance Operations.',
      evidence: {
        financeScore: Number(summary.financeScore || 0),
        financeStatus: summary.financeStatus || 'UNAVAILABLE',
        cashflow: {
          cashIn: Number(cashflow.cashIn || 0),
          cashOut: Number(cashflow.cashOut || 0),
          netCash: Number(cashflow.netCash || 0),
          receivableOpen: Number(cashflow.receivableOpen || 0),
          payableOpen: Number(cashflow.payableOpen || 0),
          projectedNet,
          riskStatus: cashflow.riskStatus || 'UNAVAILABLE',
        },
        receivables: {
          openAmount: Number(summary.receivables?.openAmount || 0),
          overdueAmount: Number(summary.receivables?.overdueAmount || 0),
          overdueCount: Number(summary.receivables?.overdueCount || 0),
        },
        payables: {
          openAmount: Number(summary.payables?.openAmount || 0),
          overdueAmount: Number(summary.payables?.overdueAmount || 0),
          overdueCount: Number(summary.payables?.overdueCount || 0),
        },
        totalOverdueAmount,
        totalOverdueCount,
        route: financeSignal.route,
        apiBase: financeSignal.apiBase,
      },
    };
  }

  private enrichExecutiveSummaryWithFinanceOperations(
    executiveSummary: any,
    financeSignal: any,
  ) {
    if (!financeSignal?.available || !financeSignal?.executiveSummary) {
      return {
        ...executiveSummary,
        financeScore: null,
        financeStatus: 'UNAVAILABLE',
        financeTotalOverdueAmount: 0,
        financeTotalOverdueCount: 0,
        financeProjectedNet: 0,
        financeCashflowRiskStatus: 'UNAVAILABLE',
      };
    }

    const summary = financeSignal.executiveSummary;
    const cashflow = summary.cashflow || {};
    const financeScore = Number(summary.financeScore || 0);
    const financeStatus = this.normalizeFinanceStatus(summary.financeStatus);
    const cashflowRiskStatus = this.normalizeFinanceStatus(cashflow.riskStatus);
    const totalOverdueAmount = Number(summary.totalOverdueAmount || 0);
    const totalOverdueCount = Number(summary.totalOverdueCount || 0);
    const projectedNet = Number(cashflow.projectedNet || 0);

    const penalty =
      financeStatus === 'CRITICAL' || cashflowRiskStatus === 'CRITICAL'
        ? 8
        : financeStatus === 'ATTENTION' || cashflowRiskStatus === 'ATTENTION'
          ? 4
          : totalOverdueAmount > 0
            ? 3
            : 0;

    const executiveScore = Math.max(
      0,
      Math.min(100, Number(executiveSummary.executiveScore || 0) - penalty),
    );

    const executiveStatus =
      executiveScore < 60 ||
      financeStatus === 'CRITICAL' ||
      cashflowRiskStatus === 'CRITICAL'
        ? 'CRITICAL'
        : executiveScore < 85 ||
            financeStatus === 'ATTENTION' ||
            cashflowRiskStatus === 'ATTENTION' ||
            totalOverdueAmount > 0
          ? 'ATTENTION'
          : executiveSummary.executiveStatus;

    return {
      ...executiveSummary,
      executiveScore,
      executiveStatus,
      financeScore,
      financeStatus,
      financeTotalOverdueAmount: totalOverdueAmount,
      financeTotalOverdueCount: totalOverdueCount,
      financeProjectedNet: projectedNet,
      financeCashflowRiskStatus: cashflowRiskStatus,
      financeReceivableOpenAmount: Number(summary.receivables?.openAmount || 0),
      financePayableOpenAmount: Number(summary.payables?.openAmount || 0),
    };
  }

  private buildExecutiveSummary(
    metrics: ModelMetric[],
    risks: ExecutiveRisk[],
  ) {
    const availableModules = metrics.filter((item) => item.available).length;
    const unavailableModules = metrics.filter((item) => !item.available).length;
    const healthyModules = metrics.filter(
      (item) => item.status === 'HEALTHY',
    ).length;
    const attentionModules = metrics.filter(
      (item) => item.status === 'ATTENTION',
    ).length;
    const criticalModules = metrics.filter(
      (item) => item.status === 'CRITICAL',
    ).length;

    const totalRecords = metrics.reduce((sum, item) => sum + item.total, 0);
    const totalCritical = metrics.reduce(
      (sum, item) => sum + (item.critical || 0),
      0,
    );
    const totalWarning = metrics.reduce(
      (sum, item) => sum + (item.warning || 0),
      0,
    );
    const totalFailed = metrics.reduce(
      (sum, item) => sum + (item.failed || 0),
      0,
    );
    const totalUnread = metrics.reduce(
      (sum, item) => sum + (item.unread || 0),
      0,
    );

    const averageScore =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, item) => sum + item.riskScore, 0) /
              metrics.length,
          )
        : 100;

    const riskPenalty =
      risks.filter((risk) => risk.severity === 'CRITICAL').length * 10 +
      risks.filter((risk) => risk.severity === 'WARNING').length * 4;

    const executiveScore = Math.max(
      0,
      Math.min(100, Math.round((averageScore + (100 - riskPenalty)) / 2)),
    );

    const executiveStatus =
      executiveScore < 60 || criticalModules > 0
        ? 'CRITICAL'
        : executiveScore < 85 || attentionModules > 0
          ? 'ATTENTION'
          : 'HEALTHY';

    return {
      executiveScore,
      executiveStatus,
      availableModules,
      unavailableModules,
      healthyModules,
      attentionModules,
      criticalModules,
      totalRecords,
      totalCritical,
      totalWarning,
      totalFailed,
      totalUnread,
      topRisks: risks.slice(0, 10),
    };
  }

  private async buildMetric(params: {
    companyId: string;
    catalog: ReturnType<CommandCenterEnterpriseService['modelCatalog']>[number];
    includeSamples: boolean;
    sampleLimit: number;
  }): Promise<ModelMetric> {
    const { companyId, catalog, includeSamples, sampleLimit } = params;
    const model = this.getModel(catalog.prismaKey);

    if (!model) {
      return {
        slug: catalog.slug,
        label: catalog.label,
        prismaKey: catalog.prismaKey,
        available: false,
        total: 0,
        riskScore: 0,
        status: 'UNAVAILABLE',
        error: 'Model indisponível no Prisma Client.',
      };
    }

    const baseWhere =
      catalog.prismaKey === 'company' ? { id: companyId } : { companyId };

    const total = await this.countSafe(catalog.prismaKey, baseWhere);

    let critical = 0;
    let warning = 0;
    let failed = 0;
    let open = 0;
    let resolved = 0;
    let unread = 0;
    let active = 0;
    let pending = 0;

    if (catalog.riskField && catalog.criticalValues?.length) {
      for (const value of catalog.criticalValues) {
        const counts = await this.countByFieldSafe({
          prismaKey: catalog.prismaKey,
          companyId,
          field: catalog.riskField,
          values: [value],
        });

        critical += counts[value] || 0;
      }
    }

    if (catalog.riskField && catalog.warningValues?.length) {
      for (const value of catalog.warningValues) {
        const counts = await this.countByFieldSafe({
          prismaKey: catalog.prismaKey,
          companyId,
          field: catalog.riskField,
          values: [value],
        });

        warning += counts[value] || 0;
      }
    }

    if (catalog.prismaKey === 'automationJob') {
      const counts = await this.countByFieldSafe({
        prismaKey: catalog.prismaKey,
        companyId,
        field: 'status',
        values: ['FAILED', 'PENDING', 'RETRY', 'COMPLETED'],
      });

      failed = counts.FAILED || 0;
      pending = (counts.PENDING || 0) + (counts.RETRY || 0);
    }

    if (catalog.prismaKey === 'notificationLog') {
      try {
        unread = await model.count({
          where: {
            companyId,
            read: false,
          },
        });
      } catch {
        unread = 0;
      }
    }

    if (catalog.prismaKey === 'webhookConfig') {
      try {
        active = await model.count({
          where: {
            companyId,
            active: true,
          },
        });
      } catch {
        active = 0;
      }
    }

    if (catalog.prismaKey === 'complianceCheck') {
      const counts = await this.countByFieldSafe({
        prismaKey: catalog.prismaKey,
        companyId,
        field: 'status',
        values: ['OPEN', 'RESOLVED', 'IGNORED', 'IN_PROGRESS'],
      });

      open = (counts.OPEN || 0) + (counts.IN_PROGRESS || 0);
      resolved = counts.RESOLVED || 0;
    }

    const status = this.calculateModuleStatus({
      total,
      critical,
      warning,
      failed,
      available: true,
    });

    const metric: ModelMetric = {
      slug: catalog.slug,
      label: catalog.label,
      prismaKey: catalog.prismaKey,
      available: true,
      total,
      active,
      pending,
      critical,
      warning,
      failed,
      open,
      resolved,
      unread,
      riskScore: status.riskScore,
      status: status.status,
    };

    if (includeSamples) {
      metric.sample = await this.sampleSafe(
        catalog.prismaKey,
        baseWhere,
        sampleLimit,
      );
    }

    return metric;
  }

  private async getRecentAudit(companyId: string, limit: number) {
    const model = this.getModel('auditLog');

    if (!model) return [];

    try {
      const rows = await model.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return this.normalize(rows) as unknown[];
    } catch {
      return [];
    }
  }

  private async getRecentActivity(companyId: string, limit: number) {
    const activity: unknown[] = [];

    const sources = [
      { prismaKey: 'auditLog', type: 'AUDIT' },
      { prismaKey: 'notificationLog', type: 'NOTIFICATION' },
      { prismaKey: 'automationJob', type: 'AUTOMATION_JOB' },
      { prismaKey: 'complianceCheck', type: 'COMPLIANCE_CHECK' },
    ];

    for (const source of sources) {
      const rows = await this.sampleSafe(
        source.prismaKey,
        { companyId },
        limit,
      );

      for (const row of rows) {
        activity.push({
          type: source.type,
          source: source.prismaKey,
          record: row,
        });
      }
    }

    return activity.slice(0, limit);
  }

  async summary(
    companyId: string,
    query: CommandCenterQueryDto,
    user?: AuthUser,
  ) {
    const cacheKey = this.buildCommandCenterCacheKey(
      'summary',
      companyId,
      query,
    );
    const cached = this.getCommandCenterCache(cacheKey);

    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          ttlMs: this.COMMAND_CENTER_CACHE_TTL_MS,
          key: cacheKey,
        },
      };
    }

    const startedAt = Date.now();

    this.validateCompanyAccess(companyId, user);

    const company = await this.ensureCompany(companyId);
    const includeSamples = query.includeSamples === 'true';
    const includeAudit = query.includeAudit !== 'false';
    const includeHealth = query.includeHealth !== 'false';
    const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);

    const catalog = this.modelCatalog();

    const metrics = await Promise.all(
      catalog.map((item) =>
        this.buildMetric({
          companyId,
          catalog: item,
          includeSamples,
          sampleLimit: Math.min(limit, 10),
        }),
      ),
    );

    const [auditSignal, financeSignal] = await Promise.all([
      this.getAuditIntelligenceSignal(companyId, user),
      this.getFinanceOperationsSignal(companyId, user),
    ]);

    const auditMetric = this.buildAuditIntelligenceMetric(auditSignal);
    const financeMetric = this.buildFinanceOperationsMetric(financeSignal);

    const metricsWithEnterpriseSignals = [
      ...metrics,
      auditMetric,
      financeMetric,
    ];

    const auditRisk = this.buildAuditIntelligenceRisk(auditSignal);
    const financeRisk = this.buildFinanceOperationsRisk(financeSignal);

    const baseRisks = this.collectRisks(metricsWithEnterpriseSignals).filter(
      (risk) =>
        risk.slug !== 'audit-intelligence' &&
        risk.slug !== 'finance-operations',
    );

    const risks = this.dedupeRisks([
      ...baseRisks,
      ...(auditRisk ? [auditRisk] : []),
      ...(financeRisk ? [financeRisk] : []),
    ]);

    const executiveSummaryWithAudit =
      this.enrichExecutiveSummaryWithAuditIntelligence(
        this.buildExecutiveSummary(metricsWithEnterpriseSignals, risks),
        auditSignal,
      );

    const executiveSummary = this.enrichExecutiveSummaryWithFinanceOperations(
      executiveSummaryWithAudit,
      financeSignal,
    );

    const [audit, activity] = await Promise.all([
      includeAudit
        ? this.getRecentAudit(companyId, limit)
        : Promise.resolve([]),
      this.getRecentActivity(companyId, limit),
    ]);

    const result = {
      status: 'OK',
      module: 'executive-command-center',
      companyId,
      company,
      requestedBy: {
        userId: this.getUserId(user),
        email: user?.email || null,
        role: user?.role || null,
      },
      executiveSummary,
      modules: metricsWithEnterpriseSignals,
      risks,
      activity,
      audit,
      financeOperations: {
        available: financeSignal.available,
        executiveSummary: financeSignal.executiveSummary,
        route: financeSignal.route,
        apiBase: financeSignal.apiBase,
        cache: financeSignal.payload?.cache || null,
        performance: financeSignal.payload?.performance || null,
        error: financeSignal.error || null,
      },
      auditIntelligence: {
        available: auditSignal.available,
        quality: auditSignal.quality,
        findings: this.slimAuditIntelligenceFindings(auditSignal.findings),
        recommendations: this.slimAuditIntelligenceRecommendations(
          auditSignal.recommendations,
        ),
        route: auditSignal.route,
        apiBase: auditSignal.apiBase,
        cache: auditSignal.payload?.cache || null,
        performance: auditSignal.payload?.performance || null,
        error: auditSignal.error || null,
      },
      cache: {
        hit: false,
        ttlMs: this.COMMAND_CENTER_CACHE_TTL_MS,
        key: cacheKey,
      },
      performance: {
        computedInMs: Date.now() - startedAt,
      },
      health: includeHealth
        ? { api: 'UP', database: 'CONNECTED', commandCenter: 'READY' }
        : null,
      generatedAt: new Date().toISOString(),
    };
    this.setCommandCenterCache(cacheKey, result as Record<string, unknown>);
    return result;
  }

  async risks(
    companyId: string,
    query: CommandCenterQueryDto,
    user?: AuthUser,
  ) {
    const cacheKey = this.buildCommandCenterCacheKey('risks', companyId, query);
    const cached = this.getCommandCenterCache(cacheKey);

    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          ttlMs: this.COMMAND_CENTER_CACHE_TTL_MS,
          key: cacheKey,
        },
      };
    }

    const startedAt = Date.now();

    const payload = await this.summary(companyId, query, user);
    const summaryPayload = payload as {
      executiveSummary?: unknown;
      risks?: unknown;
      modules?: unknown;
    };

    const response = {
      status: 'OK',
      module: 'executive-command-center-risks',
      companyId,
      executiveSummary: summaryPayload.executiveSummary,
      risks: summaryPayload.risks,
      cache: {
        hit: false,
        ttlMs: this.COMMAND_CENTER_CACHE_TTL_MS,
        key: cacheKey,
      },
      performance: {
        computedInMs: Date.now() - startedAt,
      },
      generatedAt: new Date().toISOString(),
    };

    this.setCommandCenterCache(cacheKey, response as Record<string, unknown>);

    return response;
  }

  async modules(
    companyId: string,
    query: CommandCenterQueryDto,
    user?: AuthUser,
  ) {
    const payload = await this.summary(companyId, query, user);
    const summaryPayload = payload as {
      executiveSummary?: unknown;
      modules?: unknown;
    };

    return {
      status: 'OK',
      module: 'executive-command-center-modules',
      companyId,
      executiveSummary: summaryPayload.executiveSummary,
      modules: summaryPayload.modules,
      generatedAt: new Date().toISOString(),
    };
  }

  async activity(
    companyId: string,
    query: CommandCenterQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 30), 1), 200);
    const activity = await this.getRecentActivity(companyId, limit);
    const audit = await this.getRecentAudit(companyId, limit);

    return {
      status: 'OK',
      module: 'executive-command-center-activity',
      companyId,
      activity,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }
}
