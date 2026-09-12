'use strict';

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditIntelligenceQueryDto } from './dto/audit-intelligence-query.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type FindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

type AuditRecord = {
  id?: string;
  companyId?: string | null;
  userId?: string | null;
  action?: string | null;
  module?: string | null;
  entity?: string | null;
  entityId?: string | null;
  payload?: unknown;
  statusCode?: number | null;
  responseTime?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string | Date | null;
};

type AuditFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  count: number;
  module?: string | null;
  action?: string | null;
  evidence?: Record<string, unknown>;
};

type AuditPrismaModelKey =
  | 'auditLog'
  | 'company'
  | 'notificationLog'
  | 'automationJob'
  | 'complianceCheck';

type AuditReadableModel = {
  findMany?: (args?: unknown) => Promise<unknown[]>;
  findFirst?: (args?: unknown) => Promise<unknown | null>;
  findUnique?: (args?: unknown) => Promise<unknown | null>;
  count?: (args?: unknown) => Promise<number>;
};

type AuditLogReadableModel = AuditReadableModel & {
  findMany: (args?: unknown) => Promise<unknown[]>;
  count: (args?: unknown) => Promise<number>;
};

type AuditFindFirstModel = AuditReadableModel & {
  findFirst: (args?: unknown) => Promise<unknown | null>;
};

@Injectable()
export class AuditIntelligenceEnterpriseService {
  private static readonly PAGE_LIMIT_DEFAULT = 100;
  private static readonly PAGE_LIMIT_MAX = 500;
  private static readonly LOOKBACK_DEFAULT = 300;
  private static readonly LOOKBACK_MAX = 3000;

  private readonly logger = new Logger(AuditIntelligenceEnterpriseService.name);

  private readonly executiveCache = new Map<
    string,
    {
      expiresAt: number;
      payload: Record<string, unknown>;
    }
  >();

  private readonly EXECUTIVE_CACHE_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

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

  private isReadableModel(value: unknown): value is AuditReadableModel {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as AuditReadableModel;

    return Boolean(
      candidate.findMany || candidate.findFirst || candidate.count,
    );
  }

  private hasAuditLogRead(
    value: AuditReadableModel | null,
  ): value is AuditLogReadableModel {
    return Boolean(value?.findMany && value.count);
  }

  private hasFindFirst(
    value: AuditReadableModel | null,
  ): value is AuditFindFirstModel {
    return Boolean(value?.findFirst);
  }

  private isAuditRecord(value: unknown): value is AuditRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private getModel(prismaKey: AuditPrismaModelKey): AuditReadableModel | null {
    const model = this.prisma[prismaKey] as unknown;

    return this.isReadableModel(model) ? model : null;
  }

  private get auditLogModel(): AuditLogReadableModel {
    const model = this.getModel('auditLog');

    if (!this.hasAuditLogRead(model)) {
      throw new NotFoundException('Modelo Prisma auditLog não encontrado.');
    }

    return model;
  }

  private async ensureCompany(companyId: string) {
    const companyModel = this.getModel('company');

    if (!this.hasFindFirst(companyModel)) {
      throw new NotFoundException('Modelo Prisma company não encontrado.');
    }

    const attempts: Array<() => Promise<unknown>> = [
      () => companyModel.findFirst({ where: { id: companyId } }),
      () =>
        companyModel.findFirst({
          where: { id: companyId },
          select: { id: true, name: true, createdAt: true },
        }),
    ];

    for (const attempt of attempts) {
      try {
        const company = await attempt();

        if (company) {
          return this.normalize(company);
        }
      } catch {
        continue;
      }
    }

    throw new NotFoundException(`Empresa não encontrada: ${companyId}`);
  }

  private buildWhere(companyId: string, query: AuditIntelligenceQueryDto) {
    const and: Record<string, unknown>[] = [{ companyId }];

    if (query.module) and.push({ module: query.module });
    if (query.action) and.push({ action: query.action });

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private getStatusBucket(statusCode?: number | null) {
    if (!statusCode) return 'UNKNOWN';
    if (statusCode >= 500) return '5XX';
    if (statusCode >= 400) return '4XX';
    if (statusCode >= 300) return '3XX';
    if (statusCode >= 200) return '2XX';
    return 'OTHER';
  }

  private classify(record: AuditRecord): FindingSeverity {
    const statusCode = Number(record.statusCode || 0);
    const action = String(record.action || '').toUpperCase();
    const module = String(record.module || '').toUpperCase();
    const payloadText = JSON.stringify(record.payload || {}).toUpperCase();

    if (
      statusCode >= 500 ||
      action.includes('EXCEPTION') ||
      module.includes('EXCEPTION') ||
      payloadText.includes('UNKNOWN ARGUMENT') ||
      payloadText.includes('NEST CAN') ||
      payloadText.includes('BOOTSTRAP ERROR') ||
      payloadText.includes('PRISMA')
    ) {
      return 'CRITICAL';
    }

    if (
      statusCode >= 400 ||
      action.includes('FAILED') ||
      payloadText.includes('FAILED') ||
      payloadText.includes('ERROR')
    ) {
      return 'WARNING';
    }

    return 'INFO';
  }

  private endpoint(record: AuditRecord): string {
    const request = this.payloadRecord(record.payload, 'request');

    return (
      this.payloadText(record.payload, 'url') ||
      this.payloadText(record.payload, 'path') ||
      this.payloadText(record.payload, 'endpoint') ||
      this.payloadText(request, 'url') ||
      this.payloadText(request, 'path') ||
      record.entity ||
      'unknown'
    );
  }

  private day(record: AuditRecord): string {
    if (!record.createdAt) return 'unknown';

    try {
      return new Date(record.createdAt).toISOString().slice(0, 10);
    } catch {
      return 'unknown';
    }
  }

  private groupBy<T>(
    items: T[],
    keyFactory: (item: T) => string,
  ): Record<string, number> {
    const out: Record<string, number> = {};

    for (const item of items) {
      const key = keyFactory(item) || 'unknown';
      out[key] = (out[key] || 0) + 1;
    }

    return out;
  }

  private top(map: Record<string, number>, limit = 20) {
    return Object.entries(map)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private buildFindings(records: AuditRecord[]): AuditFinding[] {
    const serverErrors = records.filter(
      (record) => Number(record.statusCode || 0) >= 500,
    );

    const clientErrors = records.filter((record) => {
      const status = Number(record.statusCode || 0);
      return status >= 400 && status < 500;
    });

    const criticalPatterns = records.filter(
      (record) => this.classify(record) === 'CRITICAL',
    );

    const warningPatterns = records.filter(
      (record) => this.classify(record) === 'WARNING',
    );

    const findings: AuditFinding[] = [];

    if (serverErrors.length > 0) {
      findings.push({
        id: 'server-errors',
        severity: 'CRITICAL',
        title: 'Erros 5xx encontrados no AuditLog',
        description:
          'Foram encontrados eventos 5xx. Classifique entre erro atual, ruído histórico e incidente já resolvido.',
        count: serverErrors.length,
        evidence: {
          byModule: this.top(
            this.groupBy(serverErrors, (record) =>
              String(record.module || 'unknown'),
            ),
            10,
          ),
          latest: this.normalize(serverErrors.slice(0, 5)),
        },
      });
    }

    if (criticalPatterns.length > 0) {
      findings.push({
        id: 'critical-audit-patterns',
        severity: 'CRITICAL',
        title: 'Padrões críticos detectados',
        description:
          'Foram encontrados registros com exception, Prisma, Unknown argument, Bootstrap error ou payload crítico.',
        count: criticalPatterns.length,
        evidence: {
          byAction: this.top(
            this.groupBy(criticalPatterns, (record) =>
              String(record.action || 'unknown'),
            ),
            10,
          ),
          latest: this.normalize(criticalPatterns.slice(0, 5)),
        },
      });
    }

    if (clientErrors.length > 0) {
      findings.push({
        id: 'client-errors',
        severity: 'WARNING',
        title: 'Erros 4xx encontrados',
        description:
          'Foram encontrados 400/401/404/409/422. Podem indicar sessão expirada, chamadas antigas ou validações incorretas.',
        count: clientErrors.length,
        evidence: {
          byEndpoint: this.top(
            this.groupBy(clientErrors, (record) => this.endpoint(record)),
            10,
          ),
          latest: this.normalize(clientErrors.slice(0, 5)),
        },
      });
    }

    if (warningPatterns.length > 0 && clientErrors.length === 0) {
      findings.push({
        id: 'warning-audit-patterns',
        severity: 'WARNING',
        title: 'Padrões de alerta encontrados',
        description:
          'Eventos classificados como alerta pela combinação de action, payload e status.',
        count: warningPatterns.length,
        evidence: {
          latest: this.normalize(warningPatterns.slice(0, 5)),
        },
      });
    }

    if (findings.length === 0) {
      findings.push({
        id: 'audit-quality-healthy',
        severity: 'INFO',
        title: 'Auditoria operacional saudável',
        description:
          'Não foram encontrados padrões críticos ou warnings relevantes no lookback consultado.',
        count: 0,
      });
    }

    return findings;
  }

  private recommendations(findings: AuditFinding[]) {
    const out: Array<{
      id: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      description: string;
      action: string;
    }> = [];

    if (findings.some((item) => item.id === 'server-errors')) {
      out.push({
        id: 'review-5xx',
        priority: 'CRITICAL',
        title: 'Revisar eventos 5xx',
        description:
          'Eventos 5xx devem ser tratados como regressão até prova contrária.',
        action:
          'Agrupar por module/action/entity e testar novamente os endpoints atuais.',
      });
    }

    if (findings.some((item) => item.id === 'critical-audit-patterns')) {
      out.push({
        id: 'classify-historical-exceptions',
        priority: 'HIGH',
        title: 'Classificar exceptions históricas',
        description:
          'Exceptions antigas podem reduzir score executivo mesmo após correção.',
        action:
          'Separar ruído histórico de incidente ativo usando payload/metadata sem migration.',
      });
    }

    if (findings.some((item) => item.id === 'client-errors')) {
      out.push({
        id: 'reduce-4xx-noise',
        priority: 'MEDIUM',
        title: 'Reduzir ruído 4xx',
        description:
          'Erros 4xx recorrentes poluem auditoria e podem indicar chamadas obsoletas no frontend.',
        action:
          'Revisar top endpoints 4xx e corrigir rotas antigas, validações e fluxos sem token.',
      });
    }

    if (out.length === 0) {
      out.push({
        id: 'keep-monitoring',
        priority: 'LOW',
        title: 'Manter monitoramento contínuo',
        description:
          'A qualidade operacional de auditoria está estável no período analisado.',
        action:
          'Continuar monitorando AuditLog, NotificationLog, AutomationJob e ComplianceCheck.',
      });
    }

    return out;
  }

  private quality(records: AuditRecord[], findings: AuditFinding[]) {
    const serverErrors = records.filter(
      (record) => Number(record.statusCode || 0) >= 500,
    );

    const clientErrors = records.filter((record) => {
      const status = Number(record.statusCode || 0);
      return status >= 400 && status < 500;
    });

    const criticalPatternCount = records.filter(
      (record) => this.classify(record) === 'CRITICAL',
    ).length;

    const warningPatternCount = records.filter(
      (record) => this.classify(record) === 'WARNING',
    ).length;

    const uniqueCriticalEvents = Math.max(
      serverErrors.length,
      criticalPatternCount,
    );

    const uniqueWarningEvents = Math.max(
      clientErrors.length,
      warningPatternCount - uniqueCriticalEvents,
      0,
    );

    const historicalNoise = records.filter((record) => {
      const payloadText = JSON.stringify(record.payload || {}).toUpperCase();
      const action = String(record.action || '').toUpperCase();

      return (
        payloadText.includes('CANNOT GET') ||
        payloadText.includes('SESSION=EXPIRED') ||
        payloadText.includes('ROUTE') ||
        action.includes('EXCEPTION_THROWN')
      );
    }).length;

    const activeSignals = Math.max(
      0,
      uniqueCriticalEvents +
        uniqueWarningEvents -
        Math.floor(historicalNoise / 2),
    );

    const penalty =
      uniqueCriticalEvents * 2 +
      uniqueWarningEvents * 0.7 +
      Math.min(historicalNoise, 50) * 0.2;

    const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

    const status =
      score < 60 || uniqueCriticalEvents > 0
        ? 'CRITICAL'
        : score < 85 || uniqueWarningEvents > 0
          ? 'ATTENTION'
          : 'HEALTHY';

    return {
      qualityScore: score,
      qualityStatus: status,
      recordsAnalyzed: records.length,
      criticalEvents: uniqueCriticalEvents,
      warningEvents: uniqueWarningEvents,
      activeSignals,
      historicalNoise,
      serverErrors: serverErrors.length,
      clientErrors: clientErrors.length,
    };
  }

  private async supportingSignals(companyId: string) {
    const safeCount = async (
      prismaKey: AuditPrismaModelKey,
      where: Record<string, unknown>,
    ) => {
      const model = this.getModel(prismaKey);

      if (!model?.count) return 0;

      try {
        return await model.count({ where });
      } catch {
        return 0;
      }
    };

    const [
      notificationsTotal,
      notificationsCritical,
      notificationsWarning,
      notificationsUnread,
      automationJobsTotal,
      automationJobsFailed,
      automationJobsQueued,
      automationJobsRunning,
      complianceChecksTotal,
      complianceChecksCritical,
      complianceChecksWarning,
      complianceChecksOpen,
    ] = await Promise.all([
      safeCount('notificationLog', { companyId }),
      safeCount('notificationLog', { companyId, severity: 'CRITICAL' }),
      safeCount('notificationLog', { companyId, severity: 'WARNING' }),
      safeCount('notificationLog', { companyId, read: false }),

      safeCount('automationJob', { companyId }),
      safeCount('automationJob', { companyId, status: 'FAILED' }),
      safeCount('automationJob', { companyId, status: 'QUEUED' }),
      safeCount('automationJob', { companyId, status: 'RUNNING' }),

      safeCount('complianceCheck', { companyId }),
      safeCount('complianceCheck', { companyId, severity: 'CRITICAL' }),
      safeCount('complianceCheck', { companyId, severity: 'WARNING' }),
      safeCount('complianceCheck', { companyId, status: 'OPEN' }),
    ]);

    return {
      notifications: {
        total: notificationsTotal,
        critical: notificationsCritical,
        warning: notificationsWarning,
        unread: notificationsUnread,
      },
      automationJobs: {
        total: automationJobsTotal,
        failed: automationJobsFailed,
        queued: automationJobsQueued,
        running: automationJobsRunning,
      },
      complianceChecks: {
        total: complianceChecksTotal,
        critical: complianceChecksCritical,
        warning: complianceChecksWarning,
        open: complianceChecksOpen,
      },
    };
  }

  async summary(
    companyId: string,
    query: AuditIntelligenceQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const company = await this.ensureCompany(companyId);
    const limit = Math.min(
      Math.max(
        Number(
          query.limit || AuditIntelligenceEnterpriseService.PAGE_LIMIT_DEFAULT,
        ),
        1,
      ),
      AuditIntelligenceEnterpriseService.PAGE_LIMIT_MAX,
    );
    const lookback = Math.min(
      Math.max(
        Number(
          query.lookback || AuditIntelligenceEnterpriseService.LOOKBACK_DEFAULT,
        ),
        1,
      ),
      AuditIntelligenceEnterpriseService.LOOKBACK_MAX,
    );
    const includeSamples = query.includeSamples === 'true';
    const includeRecommendations = query.includeRecommendations !== 'false';
    const includeRaw = query.includeRaw === 'true';

    const records = (
      await this.auditLogModel.findMany({
        where: this.buildWhere(companyId, query),
        orderBy: { createdAt: 'desc' },
        take: lookback,
      })
    ).filter((record) => this.isAuditRecord(record));

    const byModule = this.groupBy(records, (record) =>
      String(record.module || 'unknown'),
    );

    const byAction = this.groupBy(records, (record) =>
      String(record.action || 'unknown'),
    );

    const byEndpoint = this.groupBy(records, (record) => this.endpoint(record));
    const byDay = this.groupBy(records, (record) => this.day(record));

    const statusBuckets = this.groupBy(records, (record) =>
      this.getStatusBucket(record.statusCode),
    );

    const severityBuckets = this.groupBy(records, (record) =>
      this.classify(record),
    );

    const findings = this.buildFindings(records);
    const recommendations = includeRecommendations
      ? this.recommendations(findings)
      : [];
    const quality = this.quality(records, findings);
    const signals = await this.supportingSignals(companyId);

    const criticalRecords = records.filter(
      (record) => this.classify(record) === 'CRITICAL',
    );

    const warningRecords = records.filter(
      (record) => this.classify(record) === 'WARNING',
    );

    return {
      status: 'OK',
      module: 'audit-intelligence-enterprise',
      companyId,
      company,
      requestedBy: {
        userId: this.getUserId(user),
        email: user?.email || null,
        role: user?.role || null,
      },
      quality,
      totals: {
        records: records.length,
        statusBuckets,
        severityBuckets,
        modules: Object.keys(byModule).length,
        actions: Object.keys(byAction).length,
        endpoints: Object.keys(byEndpoint).length,
      },
      breakdowns: {
        byModule: this.top(byModule, 20),
        byAction: this.top(byAction, 20),
        byEndpoint: this.top(byEndpoint, 20),
        byDay: this.top(byDay, 30),
        statusBuckets,
        severityBuckets,
      },
      findings,
      recommendations,
      supportingSignals: signals,
      samples: includeSamples
        ? {
            latest: this.normalize(records.slice(0, limit)),
            critical: this.normalize(criticalRecords.slice(0, limit)),
            warning: this.normalize(warningRecords.slice(0, limit)),
          }
        : null,
      raw: includeRaw ? this.normalize(records.slice(0, limit)) : null,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildExecutiveCacheKey(
    companyId: string,
    query: AuditIntelligenceQueryDto,
  ) {
    return [
      'audit-intelligence-executive',
      companyId,
      `lookback=${query.lookback ?? AuditIntelligenceEnterpriseService.LOOKBACK_DEFAULT}`,
      `limit=${query.limit ?? AuditIntelligenceEnterpriseService.PAGE_LIMIT_DEFAULT}`,
      `includeRecommendations=${query.includeRecommendations ?? 'true'}`,
    ].join('|');
  }

  private getExecutiveCache(key: string) {
    const cached = this.executiveCache.get(key);

    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.executiveCache.delete(key);
      return null;
    }

    return cached.payload;
  }

  private setExecutiveCache(key: string, payload: Record<string, unknown>) {
    if (this.executiveCache.size > 100) {
      const firstKey = this.executiveCache.keys().next().value;

      if (firstKey) {
        this.executiveCache.delete(firstKey);
      }
    }

    this.executiveCache.set(key, {
      expiresAt: Date.now() + this.EXECUTIVE_CACHE_TTL_MS,
      payload,
    });
  }

  private slimFindingEvidence(finding: AuditFinding) {
    const evidence = finding.evidence || {};

    const byModule = Array.isArray(evidence.byModule)
      ? evidence.byModule.slice(0, 5)
      : [];

    const byAction = Array.isArray(evidence.byAction)
      ? evidence.byAction.slice(0, 5)
      : [];

    const byEndpoint = Array.isArray(evidence.byEndpoint)
      ? evidence.byEndpoint.slice(0, 5)
      : [];

    const latest = Array.isArray(evidence.latest) ? evidence.latest : [];

    const latestSummary = latest
      .slice(0, 5)
      .filter((item): item is AuditRecord => this.isAuditRecord(item))
      .map((item) => ({
        id: item.id || null,
        action: item.action || null,
        module: item.module || null,
        entity: item.entity || null,
        statusCode: item.statusCode || null,
        path:
          this.payloadText(item.payload, 'path') ||
          this.payloadText(item.payload, 'url') ||
          this.payloadText(item.payload, 'endpoint') ||
          null,
        method: this.payloadText(item.payload, 'method'),
        createdAt: item.createdAt || null,
      }));

    return {
      byModule,
      byAction,
      byEndpoint,
      latestSummary,
      totalLatestReturned: latestSummary.length,
    };
  }

  private payloadText(payload: unknown, key: string): string | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const value = (payload as Record<string, unknown>)[key];

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private payloadRecord(
    payload: unknown,
    key: string,
  ): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const value = (payload as Record<string, unknown>)[key];

    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private slimFinding(finding: AuditFinding) {
    return {
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      count: finding.count,
      module: finding.module || null,
      action: finding.action || null,
      evidenceSummary: this.slimFindingEvidence(finding),
    };
  }

  private slimRecommendations(
    recommendations: Array<{
      id: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      description: string;
      action: string;
    }>,
  ) {
    return recommendations.map((item) => ({
      id: item.id,
      priority: item.priority,
      title: item.title,
      description: item.description,
      action: item.action,
    }));
  }

  async executive(
    companyId: string,
    query: AuditIntelligenceQueryDto,
    user?: AuthUser,
  ) {
    const optimizedQuery: AuditIntelligenceQueryDto = {
      ...query,
      includeSamples: 'false',
      includeRaw: 'false',
      includeRecommendations: query.includeRecommendations ?? 'true',
      lookback: query.lookback ?? 300,
      limit: query.limit ?? 10,
    };

    const cacheKey = this.buildExecutiveCacheKey(companyId, optimizedQuery);
    const cached = this.getExecutiveCache(cacheKey);

    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          ttlMs: this.EXECUTIVE_CACHE_TTL_MS,
          key: cacheKey,
        },
      };
    }

    const startedAt = Date.now();
    const payload = await this.summary(companyId, optimizedQuery, user);

    const response = {
      status: 'OK',
      module: 'audit-intelligence-executive',
      companyId,
      quality: payload.quality,
      totals: payload.totals,
      findings: payload.findings.map((finding) => this.slimFinding(finding)),
      recommendations: this.slimRecommendations(payload.recommendations),
      supportingSignals: payload.supportingSignals,
      topBreakdowns: {
        byModule: payload.breakdowns.byModule.slice(0, 8),
        byAction: payload.breakdowns.byAction.slice(0, 8),
        byEndpoint: payload.breakdowns.byEndpoint.slice(0, 8),
        byDay: payload.breakdowns.byDay.slice(0, 12),
      },
      payloadProfile: {
        optimizedFor: 'frontend-dashboard',
        rawSamplesIncluded: false,
        fullEvidenceIncluded: false,
        latestEvidenceMode: 'summary-only',
      },
      cache: {
        hit: false,
        ttlMs: this.EXECUTIVE_CACHE_TTL_MS,
        key: cacheKey,
      },
      performance: {
        computedInMs: Date.now() - startedAt,
      },
      generatedAt: new Date().toISOString(),
    };

    this.setExecutiveCache(cacheKey, response);

    return response;
  }

  async findings(
    companyId: string,
    query: AuditIntelligenceQueryDto,
    user?: AuthUser,
  ) {
    const payload = await this.summary(companyId, query, user);

    return {
      status: 'OK',
      module: 'audit-intelligence-findings',
      companyId,
      quality: payload.quality,
      findings: payload.findings,
      recommendations: payload.recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  async breakdowns(
    companyId: string,
    query: AuditIntelligenceQueryDto,
    user?: AuthUser,
  ) {
    const payload = await this.summary(companyId, query, user);

    return {
      status: 'OK',
      module: 'audit-intelligence-breakdowns',
      companyId,
      quality: payload.quality,
      totals: payload.totals,
      breakdowns: payload.breakdowns,
      generatedAt: new Date().toISOString(),
    };
  }

  async samples(
    companyId: string,
    query: AuditIntelligenceQueryDto,
    user?: AuthUser,
  ) {
    const enrichedQuery: AuditIntelligenceQueryDto = {
      ...query,
      includeSamples: 'true',
    };

    const payload = await this.summary(companyId, enrichedQuery, user);

    return {
      status: 'OK',
      module: 'audit-intelligence-samples',
      companyId,
      quality: payload.quality,
      samples: payload.samples,
      generatedAt: new Date().toISOString(),
    };
  }
}
