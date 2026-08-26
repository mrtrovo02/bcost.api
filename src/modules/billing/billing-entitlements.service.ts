import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Company } from '@prisma/client';
import { PrismaService } from '#database/prisma.service.js';
import {
  normalizePlanToTier,
  EntitlementTier,
  CommercialPlan,
  mapTierToDefaultCommercialPlan,
} from './domain/plan-mapping.js';

export type PlanLevel = 'FREE' | 'PRO' | 'ENTERPRISE';

export type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

export type FeatureKey =
  | 'dashboard.enterprise'
  | 'automation.jobs'
  | 'automation.retry'
  | 'audit.logs'
  | 'fiscal.diagnostics'
  | 'fiscal.payroll.factorR'
  | 'banking.ofx'
  | 'banking.reconciliation'
  | 'revenue.billing'
  | 'accounting.entries'
  | 'digital.certificates'
  | 'webhooks'
  | 'ai.copilot'
  | 'ai.rag'
  | 'support.priority'
  | 'international.invoices';

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  description: string;
  minPlan: PlanLevel;
};

export type PlanDefinition = {
  level: PlanLevel;
  label: string;
  description: string;
  limits: {
    companies: number;
    users: number;
    invoicesPerMonth: number;
    bankTransactionsPerMonth: number;
    automationJobsPerMonth: number;
    auditRetentionDays: number;
    aiQuestionsPerMonth: number;
  };
};

export type LimitKey = keyof PlanDefinition['limits'];

interface CompanyRecord extends Pick<
  Company,
  'id' | 'name' | 'cnpj' | 'taxRegime' | 'active'
> {
  planLevel?: string | null;
  settings?: Prisma.JsonValue | null;
}

const PLAN_ORDER: Record<PlanLevel, number> = {
  FREE: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

const PLAN_DEFINITIONS: Record<PlanLevel, PlanDefinition> = {
  FREE: {
    level: 'FREE',
    label: 'Free / Basic',
    description: 'Plano inicial para validação e microempresas.',
    limits: {
      companies: 1,
      users: 2,
      invoicesPerMonth: 30,
      bankTransactionsPerMonth: 100,
      automationJobsPerMonth: 20,
      auditRetentionDays: 30,
      aiQuestionsPerMonth: 0,
    },
  },
  PRO: {
    level: 'PRO',
    label: 'Pro / Standard',
    description:
      'Plano profissional para operação fiscal e financeira recorrente.',
    limits: {
      companies: 3,
      users: 10,
      invoicesPerMonth: 500,
      bankTransactionsPerMonth: 2000,
      automationJobsPerMonth: 300,
      auditRetentionDays: 180,
      aiQuestionsPerMonth: 500,
    },
  },
  ENTERPRISE: {
    level: 'ENTERPRISE',
    label: 'Enterprise / Experts / MultiBenefits',
    description:
      'Plano enterprise multiusuário com assessoria avançada e automação total.',
    limits: {
      companies: 999,
      users: 999,
      invoicesPerMonth: 999999,
      bankTransactionsPerMonth: 999999,
      automationJobsPerMonth: 999999,
      auditRetentionDays: 3650,
      aiQuestionsPerMonth: 999999,
    },
  },
};

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'dashboard.enterprise',
    label: 'Dashboard Enterprise',
    description: 'Visão executiva consolidada com indicadores operacionais.',
    minPlan: 'FREE',
  },
  {
    key: 'fiscal.diagnostics',
    label: 'Diagnóstico fiscal',
    description: 'Análise fiscal, saúde tributária e indicadores do Simples.',
    minPlan: 'FREE',
  },
  {
    key: 'fiscal.payroll.factorR',
    label: 'Fator R / Folha',
    description: 'Análise de Fator R, pró-labore e economia tributária.',
    minPlan: 'PRO',
  },
  {
    key: 'banking.ofx',
    label: 'Importação OFX',
    description: 'Importação de extratos bancários para conciliação.',
    minPlan: 'PRO',
  },
  {
    key: 'banking.reconciliation',
    label: 'Conciliação bancária',
    description:
      'Motor de conciliação automática entre banco e documentos fiscais.',
    minPlan: 'PRO',
  },
  {
    key: 'revenue.billing',
    label: 'Revenue Billing',
    description: 'Faturamento automático recorrente a partir de contratos.',
    minPlan: 'PRO',
  },
  {
    key: 'international.invoices',
    label: 'Contabilidade Internacional & Invoices',
    description:
      'Gestão contábil, tributária e emissão de invoices para prestação de serviços ao exterior.',
    minPlan: 'PRO',
  },
  {
    key: 'automation.jobs',
    label: 'Automation Jobs',
    description: 'Monitoramento dos jobs operacionais da plataforma.',
    minPlan: 'PRO',
  },
  {
    key: 'automation.retry',
    label: 'Retry executável',
    description: 'Reprocessamento real de jobs suportados com auditoria.',
    minPlan: 'ENTERPRISE',
  },
  {
    key: 'audit.logs',
    label: 'AuditLog Enterprise',
    description: 'Trilha de auditoria pesquisável por módulo, ação e entidade.',
    minPlan: 'PRO',
  },
  {
    key: 'accounting.entries',
    label: 'Lançamentos contábeis',
    description: 'Base contábil para fechamento e classificação.',
    minPlan: 'PRO',
  },
  {
    key: 'digital.certificates',
    label: 'Certificados digitais',
    description: 'Gestão de certificados e alertas de vencimento.',
    minPlan: 'ENTERPRISE',
  },
  {
    key: 'webhooks',
    label: 'Webhooks',
    description: 'Integrações externas com eventos da plataforma.',
    minPlan: 'ENTERPRISE',
  },
  {
    key: 'ai.copilot',
    label: 'Copilot fiscal',
    description: 'Assistente fiscal/financeiro com IA e contexto da empresa.',
    minPlan: 'ENTERPRISE',
  },
  {
    key: 'ai.rag',
    label: 'RAG documental',
    description:
      'Busca inteligente em documentos, XMLs, obrigações e auditoria.',
    minPlan: 'ENTERPRISE',
  },
  {
    key: 'support.priority',
    label: 'Suporte prioritário',
    description: 'Atendimento prioritário e suporte consultivo.',
    minPlan: 'ENTERPRISE',
  },
];

@Injectable()
export class BillingEntitlementsService {
  private readonly logger = new Logger(BillingEntitlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.normalize(item));
    }

    if (value && typeof value === 'object' && value.constructor === Object) {
      const output: Record<string, unknown> = {};

      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = this.normalize(innerValue);
      }

      return output;
    }

    return value;
  }

  private getUserId(user?: AuthUser): string | null {
    return user?.id || user?.sub || null;
  }

  /**
   * Utiliza a camada Anti-Corruption (plan-mapping.ts) para aceitar
   * tanto tiers técnicas (FREE, PRO, ENTERPRISE) quanto nomes do catálogo comercial.
   */
  private normalizePlan(plan?: string | null): PlanLevel {
    return normalizePlanToTier(plan) as PlanLevel;
  }

  private canAccess(plan: PlanLevel, minPlan: PlanLevel): boolean {
    return PLAN_ORDER[plan] >= PLAN_ORDER[minPlan];
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;

    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.toInputJsonValue(item));
    }

    if (this.isPlainRecord(value)) {
      return this.toJsonObject(value);
    }

    return String(value);
  }

  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    if (!this.isPlainRecord(value)) return {};

    const output: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, innerValue] of Object.entries(value)) {
      if (innerValue !== undefined) {
        output[key] = this.toInputJsonValue(innerValue);
      }
    }

    return output as Prisma.InputJsonObject;
  }

  private validateCompanyAccess(companyId: string, user?: AuthUser) {
    const userCompanyId = user?.companyId;
    const role = String(user?.role || '').toUpperCase();

    if (!userCompanyId) return;

    const elevatedRoles = ['SUPER_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'];

    if (userCompanyId !== companyId && !elevatedRoles.includes(role)) {
      throw new ForbiddenException(
        'Acesso negado: empresa do token não corresponde à empresa solicitada.',
      );
    }
  }

  private validatePlanManagementPermission(user?: AuthUser) {
    const role = String(user?.role || '').toUpperCase();

    const allowedRoles = ['OWNER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN'];

    if (role && !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Apenas OWNER/ADMIN pode alterar plano da empresa.',
      );
    }
  }

  private async findCompany(companyId: string): Promise<CompanyRecord> {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
    });

    if (!company) {
      throw new NotFoundException(`Empresa não encontrada: ${companyId}`);
    }

    return company;
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    action: string;
    entityId?: string | null;
    severity?: string;
    source?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ recorded: boolean; error?: string }> {
    const auditLog = this.prisma.auditLog;
    const userId = this.getUserId(params.user);

    if (!auditLog?.create) {
      return {
        recorded: false,
        error: 'auditLog indisponível no PrismaService.',
      };
    }

    const payload = this.toJsonObject({
      ...(params.payload ?? {}),
      severity: params.severity ?? 'INFO',
      source: params.source ?? 'billing-entitlements',
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    });

    const baseData = {
      module: 'billing',
      action: params.action,
      entity: 'CompanyPlan',
      entityId: params.entityId ?? params.companyId,
      payload,
      statusCode: 200,
      responseTime: null,
      ipAddress: null,
      userAgent: null,
    };

    const candidates: Array<{
      label: string;
      data: Prisma.AuditLogUncheckedCreateInput;
    }> = [
      {
        label: 'scalar-schema-first',
        data: {
          companyId: params.companyId,
          ...(userId ? { userId } : {}),
          ...baseData,
        },
      },
      {
        label: 'scalar-minimal-schema-first',
        data: {
          companyId: params.companyId,
          module: 'billing',
          action: params.action,
          entity: 'CompanyPlan',
          entityId: params.entityId ?? params.companyId,
          payload,
        },
      },
    ];

    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        await auditLog.create({
          data: candidate.data,
        });

        return {
          recorded: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`[${candidate.label}] ${message}`);
      }
    }

    const lastError =
      errors[errors.length - 1] ||
      errors[0] ||
      'Falha desconhecida ao gravar AuditLog.';

    this.logger.warn(`[BillingEntitlements] AuditLog skipped: ${lastError}`);

    return {
      recorded: false,
      error: lastError,
    };
  }

  buildEntitlements(company: CompanyRecord) {
    const planLevel = this.normalizePlan(company.planLevel);
    const plan = PLAN_DEFINITIONS[planLevel];
    const defaultCommercialPlan = mapTierToDefaultCommercialPlan(
      planLevel as EntitlementTier,
    );

    const features = FEATURE_DEFINITIONS.map((feature) => {
      const enabled = this.canAccess(planLevel, feature.minPlan);

      return {
        ...feature,
        enabled,
        locked: !enabled,
      };
    });

    const enabledFeatures = features
      .filter((feature) => feature.enabled)
      .map((feature) => feature.key);

    const lockedFeatures = features
      .filter((feature) => feature.locked)
      .map((feature) => feature.key);

    const result = {
      companyId: company.id,
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        taxRegime: company.taxRegime,
        active: company.active,
      },
      plan,
      planLevel,
      commercialPlan: defaultCommercialPlan,
      features,
      enabledFeatures,
      lockedFeatures,
      limits: plan.limits,
      commercial: {
        canUpgrade: planLevel !== 'ENTERPRISE',
        recommendedPlan:
          planLevel === 'FREE'
            ? 'PRO'
            : planLevel === 'PRO'
              ? 'ENTERPRISE'
              : null,
        upgradeReasons:
          planLevel === 'FREE'
            ? [
                'Desbloquear conciliação bancária',
                'Liberar faturamento e invoices internacionais',
                'Acessar auditoria enterprise',
                'Aumentar limites operacionais',
              ]
            : planLevel === 'PRO'
              ? [
                  'Liberar reprocessamento executável',
                  'Liberar certificado digital',
                  'Liberar webhooks',
                  'Liberar Copilot fiscal e RAG documental',
                ]
              : [],
      },
      generatedAt: new Date().toISOString(),
    };

    return this.normalize(result);
  }

  async getEntitlements(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const company = await this.findCompany(companyId);
    const entitlements = this.buildEntitlements(company);

    return {
      status: 'OK',
      ...(entitlements as Record<string, unknown>),
    };
  }

  async updatePlan(
    companyId: string,
    planLevelInput: string,
    user?: AuthUser,
    reason?: string,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validatePlanManagementPermission(user);

    const before = await this.findCompany(companyId);
    const oldPlan = this.normalizePlan(before.planLevel);
    const newPlan = this.normalizePlan(planLevelInput);

    const currentSettings = this.isPlainRecord(before.settings)
      ? before.settings
      : {};
    const currentBilling = this.isPlainRecord(currentSettings.billing)
      ? currentSettings.billing
      : {};

    const updated = await this.prisma.company.update({
      where: {
        id: companyId,
      },
      data: {
        planLevel: newPlan,
        settings: this.toJsonObject({
          ...currentSettings,
          billing: {
            ...currentBilling,
            lastPlanChangeAt: new Date().toISOString(),
            lastPlanChangeBy: this.getUserId(user),
            lastPlanChangeReason: reason ?? null,
            requestedPlanInput: planLevelInput,
          },
        }),
      },
    });

    const entitlements = this.buildEntitlements(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      action: 'COMPANY_PLAN_UPDATED',
      entityId: companyId,
      severity: 'INFO',
      source: 'billing-entitlements',
      payload: {
        companyId,
        oldPlan,
        newPlan,
        requestedPlanInput: planLevelInput,
        reason: reason ?? null,
        userId: this.getUserId(user),
      },
    });

    return this.normalize({
      status: 'OK',
      message: `Plano atualizado de ${oldPlan} para ${newPlan}.`,
      oldPlan,
      newPlan,
      audit,
      ...(entitlements as Record<string, unknown>),
      generatedAt: new Date().toISOString(),
    });
  }

  async getPlans() {
    return this.normalize({
      status: 'OK',
      plans: Object.values(PLAN_DEFINITIONS),
      features: FEATURE_DEFINITIONS,
      generatedAt: new Date().toISOString(),
    });
  }

  async checkFeature(companyId: string, featureKey: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const company = await this.findCompany(companyId);
    const planLevel = this.normalizePlan(company.planLevel);
    const feature = FEATURE_DEFINITIONS.find((item) => item.key === featureKey);

    if (!feature) {
      return this.normalize({
        status: 'UNKNOWN_FEATURE',
        allowed: false,
        companyId,
        planLevel,
        featureKey,
        message: 'Feature não catalogada.',
        generatedAt: new Date().toISOString(),
      });
    }

    const allowed = this.canAccess(planLevel, feature.minPlan);

    return this.normalize({
      status: allowed ? 'ALLOWED' : 'LOCKED',
      allowed,
      companyId,
      planLevel,
      feature,
      message: allowed
        ? 'Feature liberada para o plano atual.'
        : `Feature exige plano mínimo ${feature.minPlan}.`,
      generatedAt: new Date().toISOString(),
    });
  }

  /**
   * Valida se o uso atual de um recurso da empresa está dentro do limite permitido pelo plano.
   */
  async checkLimit(
    companyId: string,
    limitKey: LimitKey,
    currentUsage: number,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const company = await this.findCompany(companyId);
    const planLevel = this.normalizePlan(company.planLevel);
    const planDef = PLAN_DEFINITIONS[planLevel];

    if (!(limitKey in planDef.limits)) {
      throw new BadRequestException(
        `Limite inválido ou não suportado: ${limitKey}`,
      );
    }

    const maxAllowed = planDef.limits[limitKey];
    const allowed = currentUsage < maxAllowed;

    return this.normalize({
      status: allowed ? 'ALLOWED' : 'LIMIT_EXCEEDED',
      allowed,
      companyId,
      planLevel,
      limitKey,
      currentUsage,
      maxAllowed,
      remaining: Math.max(0, maxAllowed - currentUsage),
      message: allowed
        ? `Uso dentro do limite permitido (${currentUsage}/${maxAllowed}).`
        : `Limite do plano excedido (${currentUsage}/${maxAllowed}). Realize o upgrade para continuar.`,
      generatedAt: new Date().toISOString(),
    });
  }
}
