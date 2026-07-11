'use strict';

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

type PlanLevel = 'FREE' | 'PRO' | 'ENTERPRISE';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  companyId?: string;
  [key: string]: unknown;
};

type FeatureKey =
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
  | 'support.priority';

type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  description: string;
  minPlan: PlanLevel;
};

type PlanDefinition = {
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

const PLAN_ORDER: Record<PlanLevel, number> = {
  FREE: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

const PLAN_DEFINITIONS: Record<PlanLevel, PlanDefinition> = {
  FREE: {
    level: 'FREE',
    label: 'Free',
    description: 'Plano inicial para validação do produto.',
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
    label: 'Pro',
    description: 'Plano profissional para operação fiscal/financeira recorrente.',
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
    label: 'Enterprise',
    description: 'Plano enterprise multiusuário, auditável e com automação avançada.',
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
    description: 'Motor de conciliação automática entre banco e documentos fiscais.',
    minPlan: 'PRO',
  },
  {
    key: 'revenue.billing',
    label: 'Revenue Billing',
    description: 'Faturamento automático recorrente a partir de contratos.',
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
    description: 'Busca inteligente em documentos, XMLs, obrigações e auditoria.',
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

    if (value && typeof value === 'object') {
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

  private normalizePlan(plan?: string | null): PlanLevel {
    const value = String(plan || 'FREE').toUpperCase();

    if (value === 'ENTERPRISE') return 'ENTERPRISE';
    if (value === 'PRO') return 'PRO';

    return 'FREE';
  }

  private canAccess(plan: PlanLevel, minPlan: PlanLevel): boolean {
    return PLAN_ORDER[plan] >= PLAN_ORDER[minPlan];
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

    const allowedRoles = [
      'OWNER',
      'ADMIN',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (role && !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Apenas OWNER/ADMIN pode alterar plano da empresa.',
      );
    }
  }

  private async findCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      } as any,
    });

    if (!company) {
      throw new NotFoundException(`Empresa não encontrada: ${companyId}`);
    }

    return company as any;
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
    const auditLog = (this.prisma as any).auditLog;
    const userId = this.getUserId(params.user);

    if (!auditLog?.create) {
      return {
        recorded: false,
        error: 'auditLog indisponível no PrismaService.',
      };
    }

    /**
     * IMPORTANTE — schema.prisma real:
     *
     * AuditLog possui:
     * - action
     * - module
     * - entity
     * - entityId
     * - payload
     * - statusCode
     * - responseTime
     * - ipAddress
     * - userAgent
     * - userId
     * - companyId
     * - company relation
     * - user relation
     *
     * AuditLog NÃO possui:
     * - severity
     * - source
     * - metadata
     *
     * Por isso, severity/source/reason/contexto comercial vão dentro do payload.
     */
    const payload = {
      ...(params.payload ?? {}),
      severity: params.severity ?? 'INFO',
      source: params.source ?? 'billing-entitlements',
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    };

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
      data: Record<string, unknown>;
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
        label: 'relation-schema-first',
        data: {
          company: {
            connect: {
              id: params.companyId,
            },
          },
          ...(userId
            ? {
                user: {
                  connect: {
                    id: userId,
                  },
                },
              }
            : {}),
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
      {
        label: 'relation-minimal-schema-first',
        data: {
          company: {
            connect: {
              id: params.companyId,
            },
          },
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


  buildEntitlements(company: any) {
    const planLevel = this.normalizePlan(company.planLevel);
    const plan = PLAN_DEFINITIONS[planLevel];

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

    return {
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
                'Liberar billing recorrente',
                'Acessar auditoria enterprise',
                'Aumentar limites operacionais',
              ]
            : planLevel === 'PRO'
              ? [
                  'Liberar retry executável',
                  'Liberar certificado digital',
                  'Liberar webhooks',
                  'Liberar Copilot fiscal e RAG documental',
                ]
              : [],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getEntitlements(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const company = await this.findCompany(companyId);
    const entitlements = this.buildEntitlements(company);

    return {
      status: 'OK',
      ...entitlements,
    };
  }

  async updatePlan(
    companyId: string,
    planLevel: PlanLevel,
    user?: AuthUser,
    reason?: string,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validatePlanManagementPermission(user);

    const before = await this.findCompany(companyId);
    const oldPlan = this.normalizePlan(before.planLevel);
    const newPlan = this.normalizePlan(planLevel);

    const currentSettings =
      before.settings && typeof before.settings === 'object'
        ? before.settings
        : {};

    const updated = await this.prisma.company.update({
      where: {
        id: companyId,
      },
      data: {
        planLevel: newPlan,
        settings: {
          ...(currentSettings as Record<string, unknown>),
          billing: {
            ...((currentSettings as Record<string, unknown>).billing as
              | Record<string, unknown>
              | undefined),
            lastPlanChangeAt: new Date().toISOString(),
            lastPlanChangeBy: this.getUserId(user),
            lastPlanChangeReason: reason ?? null,
          },
        } as any,
      } as any,
    });

    const entitlements = this.buildEntitlements(updated as any);

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
        reason: reason ?? null,
        userId: this.getUserId(user),
      },
    });

    return {
      status: 'OK',
      message: `Plano atualizado de ${oldPlan} para ${newPlan}.`,
      oldPlan,
      newPlan,
      audit,
      ...entitlements,
      generatedAt: new Date().toISOString(),
    };
  }

  async getPlans() {
    return {
      status: 'OK',
      plans: Object.values(PLAN_DEFINITIONS),
      features: FEATURE_DEFINITIONS,
      generatedAt: new Date().toISOString(),
    };
  }

  async checkFeature(
    companyId: string,
    featureKey: string,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const company = await this.findCompany(companyId);
    const planLevel = this.normalizePlan(company.planLevel);
    const feature = FEATURE_DEFINITIONS.find(
      (item) => item.key === featureKey,
    );

    if (!feature) {
      return {
        status: 'UNKNOWN_FEATURE',
        allowed: false,
        companyId,
        planLevel,
        featureKey,
        message: 'Feature não catalogada.',
        generatedAt: new Date().toISOString(),
      };
    }

    const allowed = this.canAccess(planLevel, feature.minPlan);

    return {
      status: allowed ? 'ALLOWED' : 'LOCKED',
      allowed,
      companyId,
      planLevel,
      feature,
      message: allowed
        ? 'Feature liberada para o plano atual.'
        : `Feature exige plano mínimo ${feature.minPlan}.`,
      generatedAt: new Date().toISOString(),
    };
  }
}
