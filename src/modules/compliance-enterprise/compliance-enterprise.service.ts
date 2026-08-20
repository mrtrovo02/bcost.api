'use strict';

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ComplianceStatus, NotificationSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { ComplianceEnterpriseQueryDto } from './dto/compliance-enterprise-query.dto.js';
import { CreateBusinessRuleEnterpriseDto } from './dto/create-business-rule-enterprise.dto.js';
import { CreateComplianceCheckEnterpriseDto } from './dto/create-compliance-check-enterprise.dto.js';
import { RunComplianceEngineDto } from './dto/run-compliance-engine.dto.js';
import { UpdateBusinessRuleEnterpriseDto } from './dto/update-business-rule-enterprise.dto.js';
import { UpdateComplianceCheckEnterpriseDto } from './dto/update-compliance-check-enterprise.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  companyId?: string;
  [key: string]: unknown;
};

type EngineFinding = {
  key: string;
  checkName: string;
  severity: NotificationSeverity;
  description: string;
  source: string;
  entity?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ComplianceEnterpriseService {
  private readonly logger = new Logger(ComplianceEnterpriseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get businessRuleModel() {
    const model = (this.prisma as any).businessRule;

    if (!model) {
      throw new NotFoundException('Modelo Prisma businessRule não encontrado.');
    }

    return model;
  }

  private get complianceCheckModel() {
    const model = (this.prisma as any).complianceCheck;

    if (!model) {
      throw new NotFoundException(
        'Modelo Prisma complianceCheck não encontrado.',
      );
    }

    return model;
  }

  private get auditLogModel() {
    return (this.prisma as any).auditLog;
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

  private validateWritePermission(user?: AuthUser) {
    const role = String(user?.role || '').toUpperCase();

    if (!role) return;

    const allowedRoles = [
      'OWNER',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'FINANCE',
      'HR',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Perfil sem permissão para gerenciar Compliance Enterprise.',
      );
    }
  }

  private toNumber(value: unknown): number {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    return Number(value || 0);
  }

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

    return company;
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    module: 'business-rules' | 'compliance-checks' | 'compliance-engine';
    action: string;
    entity: 'BusinessRule' | 'ComplianceCheck' | 'ComplianceEngine';
    entityId?: string | null;
    payload?: Record<string, unknown>;
    statusCode?: number;
  }): Promise<{ recorded: boolean; error?: string }> {
    const auditLog = this.auditLogModel;
    const userId = this.getUserId(params.user);

    if (!auditLog?.create) {
      return {
        recorded: false,
        error: 'auditLog indisponível no PrismaService.',
      };
    }

    const payload = {
      ...(params.payload || {}),
      source: 'compliance-enterprise',
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    };

    const baseData = {
      module: params.module,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      payload,
      statusCode: params.statusCode ?? 200,
      responseTime: null,
      ipAddress: null,
      userAgent: null,
    };

    const attempts: Array<{ label: string; data: Record<string, unknown> }> = [
      {
        label: 'scalar',
        data: {
          companyId: params.companyId,
          ...(userId ? { userId } : {}),
          ...baseData,
        },
      },
      {
        label: 'relation',
        data: {
          company: { connect: { id: params.companyId } },
          ...(userId ? { user: { connect: { id: userId } } } : {}),
          ...baseData,
        },
      },
      {
        label: 'minimal',
        data: {
          companyId: params.companyId,
          module: params.module,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          payload,
        },
      },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        await auditLog.create({
          data: attempt.data,
        });

        return {
          recorded: true,
        };
      } catch (error) {
        errors.push(
          `[${attempt.label}] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const error = errors.at(-1) || 'Falha desconhecida ao gravar AuditLog.';
    this.logger.warn(`[ComplianceEnterprise] AuditLog skipped: ${error}`);

    return {
      recorded: false,
      error,
    };
  }

  private enrichRule(rule: any) {
    return {
      ...rule,
      createdAt: rule.createdAt ? new Date(rule.createdAt).toISOString() : null,
      updatedAt: rule.updatedAt ? new Date(rule.updatedAt).toISOString() : null,
      lastTriggeredAt: rule.lastTriggeredAt
        ? new Date(rule.lastTriggeredAt).toISOString()
        : null,
      operationalStatus: rule.enabled ? 'ENABLED' : 'DISABLED',
    };
  }

  private enrichCheck(check: any) {
    return {
      ...check,
      resolvedAt: check.resolvedAt
        ? new Date(check.resolvedAt).toISOString()
        : null,
      createdAt: check.createdAt
        ? new Date(check.createdAt).toISOString()
        : null,
      updatedAt: check.updatedAt
        ? new Date(check.updatedAt).toISOString()
        : null,
      operationalStatus: check.resolved ? 'CLOSED' : check.status,
    };
  }

  private buildRulesWhere(
    companyId: string,
    query: ComplianceEnterpriseQueryDto,
  ) {
    const and: Record<string, unknown>[] = [{ companyId }];

    if (query.enabled !== undefined) {
      and.push({
        enabled: query.enabled === 'true',
      });
    }

    if (query.search) {
      and.push({
        OR: [
          {
            name: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private buildChecksWhere(
    companyId: string,
    query: ComplianceEnterpriseQueryDto,
  ) {
    const and: Record<string, unknown>[] = [{ companyId }];

    if (query.severity) {
      and.push({
        severity: query.severity as NotificationSeverity,
      });
    }

    if (query.status) {
      and.push({
        status: query.status as ComplianceStatus,
      });
    }

    if (query.resolved !== undefined) {
      and.push({
        resolved: query.resolved === 'true',
      });
    }

    if (query.source) {
      and.push({
        description: {
          contains: `[source:${query.source}]`,
          mode: 'insensitive',
        },
      });
    }

    if (query.search) {
      and.push({
        OR: [
          {
            checkName: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private buildRulesSummary(items: any[]) {
    const summary = {
      count: items.length,
      enabled: 0,
      disabled: 0,
      totalTriggerCount: 0,
    };

    for (const item of items) {
      if (item.enabled) summary.enabled += 1;
      else summary.disabled += 1;

      summary.totalTriggerCount += Number(item.triggerCount || 0);
    }

    return summary;
  }

  private buildChecksSummary(items: any[]) {
    const summary = {
      count: items.length,
      open: 0,
      resolved: 0,
      ignored: 0,
      inProgress: 0,
      info: 0,
      warning: 0,
      critical: 0,
      riskScore: 100,
      bySeverity: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    let penalty = 0;

    for (const item of items) {
      const status = String(item.status || 'OPEN');
      const severity = String(item.severity || 'INFO');

      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

      if (item.resolved || status === 'RESOLVED') summary.resolved += 1;
      else if (status === 'IGNORED') summary.ignored += 1;
      else if (status === 'IN_PROGRESS') summary.inProgress += 1;
      else summary.open += 1;

      if (!item.resolved && status !== 'RESOLVED' && status !== 'IGNORED') {
        if (severity === 'CRITICAL') {
          summary.critical += 1;
          penalty += 18;
        } else if (severity === 'WARNING') {
          summary.warning += 1;
          penalty += 8;
        } else {
          summary.info += 1;
          penalty += 2;
        }
      }
    }

    summary.riskScore = Math.max(0, Math.min(100, 100 - penalty));

    return summary;
  }

  private sourceDescription(finding: EngineFinding): string {
    const metadata = finding.metadata
      ? ` metadata=${JSON.stringify(this.normalize(finding.metadata))}`
      : '';

    return `[source:${finding.source}] [key:${finding.key}] ${finding.description}${metadata}`;
  }

  async listRules(
    companyId: string,
    query: ComplianceEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.businessRuleModel.findMany({
      where: this.buildRulesWhere(companyId, query),
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
      take: limit + 1,
      skip: offset,
    });

    const items = rows
      .slice(0, limit)
      .map((item: any) => this.enrichRule(item));

    return {
      status: 'OK',
      module: 'business-rules',
      model: 'BusinessRule',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildRulesSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createRule(
    companyId: string,
    dto: CreateBusinessRuleEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const created = await this.businessRuleModel.create({
      data: {
        companyId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        condition: dto.condition,
        action: dto.action,
        enabled: dto.enabled ?? true,
      },
    });

    const item = this.enrichRule(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'business-rules',
      action: 'BUSINESS_RULE_CREATED',
      entity: 'BusinessRule',
      entityId: created.id,
      payload: {
        item: this.normalize(item) as Record<string, unknown>,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Regra de negócio criada com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateRule(
    companyId: string,
    ruleId: string,
    dto: UpdateBusinessRuleEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.businessRuleModel.findFirst({
      where: {
        id: ruleId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(`Regra de negócio não encontrada: ${ruleId}`);
    }

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.action !== undefined) data.action = dto.action;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;

    const updated = await this.businessRuleModel.update({
      where: { id: ruleId },
      data,
    });

    const item = this.enrichRule(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'business-rules',
      action: 'BUSINESS_RULE_UPDATED',
      entity: 'BusinessRule',
      entityId: ruleId,
      payload: {
        before: this.normalize(this.enrichRule(current)) as Record<
          string,
          unknown
        >,
        after: this.normalize(item) as Record<string, unknown>,
      },
    });

    return {
      status: 'OK',
      message: 'Regra de negócio atualizada com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async setRuleEnabled(
    companyId: string,
    ruleId: string,
    enabled: boolean,
    user?: AuthUser,
  ) {
    return this.updateRule(companyId, ruleId, { enabled }, user);
  }

  async createDefaultRules(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const defaults = [
      {
        name: 'Certificado vencido ou próximo do vencimento',
        description:
          'Gera riscos quando certificados digitais expiram, são revogados ou estão próximos do vencimento.',
        condition: {
          type: 'builtin',
          sourceModule: 'digital-certificates',
          rule: 'certificate-expiration',
        },
        action: {
          createComplianceCheck: true,
          severity: 'WARNING',
        },
      },
      {
        name: 'Obrigações fiscais e tributárias críticas',
        description:
          'Gera riscos para obrigações tributárias vencidas e obrigações fiscais rejeitadas/vencidas.',
        condition: {
          type: 'builtin',
          sourceModule: 'obligations',
          rule: 'overdue-or-rejected',
        },
        action: {
          createComplianceCheck: true,
          severity: 'CRITICAL',
        },
      },
      {
        name: 'Conciliação bancária pendente',
        description:
          'Gera riscos para transações bancárias antigas sem conciliação.',
        condition: {
          type: 'builtin',
          sourceModule: 'banking',
          rule: 'unreconciled-transactions',
        },
        action: {
          createComplianceCheck: true,
          severity: 'WARNING',
        },
      },
      {
        name: 'Folha da competência atual',
        description:
          'Gera riscos quando há colaboradores ativos sem folha gerada ou com divergência de eventos.',
        condition: {
          type: 'builtin',
          sourceModule: 'payroll',
          rule: 'current-payroll-health',
        },
        action: {
          createComplianceCheck: true,
          severity: 'WARNING',
        },
      },
      {
        name: 'Jobs de automação com falha',
        description: 'Gera riscos para jobs de automação com status FAILED.',
        condition: {
          type: 'builtin',
          sourceModule: 'automation-jobs',
          rule: 'failed-jobs',
        },
        action: {
          createComplianceCheck: true,
          severity: 'WARNING',
        },
      },
    ];

    const created: any[] = [];
    const skipped: any[] = [];

    for (const rule of defaults) {
      const existing = await this.businessRuleModel.findFirst({
        where: {
          companyId,
          name: rule.name,
        },
      });

      if (existing) {
        skipped.push(this.enrichRule(existing));
        continue;
      }

      const createdRule = await this.businessRuleModel.create({
        data: {
          companyId,
          name: rule.name,
          description: rule.description,
          condition: rule.condition,
          action: rule.action,
          enabled: true,
        },
      });

      created.push(this.enrichRule(createdRule));
    }

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'business-rules',
      action: 'BUSINESS_RULE_DEFAULTS_CREATED',
      entity: 'BusinessRule',
      entityId: companyId,
      payload: {
        created: created.length,
        skipped: skipped.length,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Regras padrão criadas/validadas com sucesso.',
      companyId,
      created: this.normalize(created),
      skipped: this.normalize(skipped),
      totals: {
        created: created.length,
        skipped: skipped.length,
      },
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async listChecks(
    companyId: string,
    query: ComplianceEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.complianceCheckModel.findMany({
      where: this.buildChecksWhere(companyId, query),
      orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      skip: offset,
    });

    const items = rows
      .slice(0, limit)
      .map((item: any) => this.enrichCheck(item));

    return {
      status: 'OK',
      module: 'compliance-checks',
      model: 'ComplianceCheck',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildChecksSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createCheck(
    companyId: string,
    dto: CreateComplianceCheckEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const status = (dto.status || 'OPEN') as ComplianceStatus;
    const resolved = status === 'RESOLVED' || status === 'IGNORED';

    const created = await this.complianceCheckModel.create({
      data: {
        companyId,
        checkName: dto.checkName.trim(),
        severity: (dto.severity || 'INFO') as NotificationSeverity,
        status,
        description: dto.description?.trim() || null,
        resolved,
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? this.getUserId(user) : null,
      },
    });

    const item = this.enrichCheck(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'compliance-checks',
      action: 'COMPLIANCE_CHECK_CREATED',
      entity: 'ComplianceCheck',
      entityId: created.id,
      payload: {
        item: this.normalize(item) as Record<string, unknown>,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Check de compliance criado com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateCheck(
    companyId: string,
    checkId: string,
    dto: UpdateComplianceCheckEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.complianceCheckModel.findFirst({
      where: {
        id: checkId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Check de compliance não encontrado: ${checkId}`,
      );
    }

    const data: Record<string, unknown> = {};

    if (dto.severity !== undefined) {
      data.severity = dto.severity as NotificationSeverity;
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.status !== undefined) {
      const status = dto.status as ComplianceStatus;
      const resolved = status === 'RESOLVED' || status === 'IGNORED';

      data.status = status;
      data.resolved = resolved;
      data.resolvedAt = resolved ? new Date() : null;
      data.resolvedBy = resolved ? this.getUserId(user) : null;
    }

    const updated = await this.complianceCheckModel.update({
      where: { id: checkId },
      data,
    });

    const item = this.enrichCheck(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'compliance-checks',
      action: 'COMPLIANCE_CHECK_UPDATED',
      entity: 'ComplianceCheck',
      entityId: checkId,
      payload: {
        before: this.normalize(this.enrichCheck(current)) as Record<
          string,
          unknown
        >,
        after: this.normalize(item) as Record<string, unknown>,
      },
    });

    return {
      status: 'OK',
      message: 'Check de compliance atualizado com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async setCheckStatus(
    companyId: string,
    checkId: string,
    status: ComplianceStatus,
    user?: AuthUser,
  ) {
    return this.updateCheck(companyId, checkId, { status }, user);
  }

  private async pushCertificateFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const model = (this.prisma as any).digitalCertificate;
    if (!model?.findMany) return;

    const certificates = await model.findMany({
      where: { companyId },
      take: 500,
    });

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    for (const cert of certificates) {
      const validTo = new Date(cert.validTo).getTime();
      const daysToExpire = Math.ceil((validTo - now) / day);

      if (String(cert.status) === 'REVOKED') {
        findings.push({
          key: `CERT_REVOKED:${cert.id}`,
          checkName: 'Certificado digital revogado',
          severity: NotificationSeverity.CRITICAL,
          description: `O certificado ${cert.issuer} está revogado.`,
          source: 'digital-certificates',
          entity: 'DigitalCertificate',
          entityId: cert.id,
          metadata: {
            issuer: cert.issuer,
            status: cert.status,
          },
        });
      } else if (daysToExpire < 0 || String(cert.status) === 'EXPIRED') {
        findings.push({
          key: `CERT_EXPIRED:${cert.id}`,
          checkName: 'Certificado digital expirado',
          severity: NotificationSeverity.CRITICAL,
          description: `O certificado ${cert.issuer} expirou há ${Math.abs(daysToExpire)} dias.`,
          source: 'digital-certificates',
          entity: 'DigitalCertificate',
          entityId: cert.id,
          metadata: {
            issuer: cert.issuer,
            validTo: cert.validTo,
            daysToExpire,
          },
        });
      } else if (daysToExpire <= 30) {
        findings.push({
          key: `CERT_EXPIRING:${cert.id}`,
          checkName: 'Certificado digital próximo do vencimento',
          severity:
            daysToExpire <= 7
              ? NotificationSeverity.CRITICAL
              : NotificationSeverity.WARNING,
          description: `O certificado ${cert.issuer} vence em ${daysToExpire} dias.`,
          source: 'digital-certificates',
          entity: 'DigitalCertificate',
          entityId: cert.id,
          metadata: {
            issuer: cert.issuer,
            validTo: cert.validTo,
            daysToExpire,
          },
        });
      }
    }
  }

  private async pushObligationFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const now = new Date();

    const taxModel = (this.prisma as any).taxObligation;
    if (taxModel?.findMany) {
      const taxObligations = await taxModel.findMany({
        where: { companyId },
        take: 1000,
      });

      for (const item of taxObligations) {
        const overdue = new Date(item.dueDate).getTime() < now.getTime();
        const status = String(item.status);

        if (overdue && !['PAID', 'CANCELLED'].includes(status)) {
          findings.push({
            key: `TAX_OVERDUE:${item.id}`,
            checkName: 'Obrigação tributária vencida',
            severity: NotificationSeverity.CRITICAL,
            description: `${item.name} venceu em ${new Date(item.dueDate).toISOString()}. Valor: ${this.toNumber(item.amount)}.`,
            source: 'tax-obligations',
            entity: 'TaxObligation',
            entityId: item.id,
            metadata: {
              status,
              dueDate: item.dueDate,
              amount: this.toNumber(item.amount),
            },
          });
        }
      }
    }

    const fiscalModel = (this.prisma as any).fiscalObligation;
    if (fiscalModel?.findMany) {
      const fiscalObligations = await fiscalModel.findMany({
        where: { companyId },
        take: 1000,
      });

      for (const item of fiscalObligations) {
        const overdue = new Date(item.dueDate).getTime() < now.getTime();
        const status = String(item.status);

        if (status === 'REJECTED') {
          findings.push({
            key: `FISCAL_REJECTED:${item.id}`,
            checkName: 'Obrigação fiscal rejeitada',
            severity: NotificationSeverity.CRITICAL,
            description: `${item.type} ${item.referenceMonth}/${item.referenceYear} está rejeitada.`,
            source: 'fiscal-obligations',
            entity: 'FiscalObligation',
            entityId: item.id,
            metadata: {
              status,
              type: item.type,
            },
          });
        } else if (overdue && !['ACCEPTED', 'SUBMITTED'].includes(status)) {
          findings.push({
            key: `FISCAL_OVERDUE:${item.id}`,
            checkName: 'Obrigação fiscal vencida',
            severity: NotificationSeverity.WARNING,
            description: `${item.type} ${item.referenceMonth}/${item.referenceYear} venceu em ${new Date(item.dueDate).toISOString()}.`,
            source: 'fiscal-obligations',
            entity: 'FiscalObligation',
            entityId: item.id,
            metadata: {
              status,
              type: item.type,
              dueDate: item.dueDate,
            },
          });
        }
      }
    }
  }

  private async pushBankingFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const model = (this.prisma as any).bankTransaction;
    if (!model?.findMany) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const transactions = await model.findMany({
      where: {
        companyId,
        reconciled: false,
        occurredAt: { lt: sevenDaysAgo },
      },
      take: 100,
      orderBy: { occurredAt: 'asc' },
    });

    for (const tx of transactions) {
      findings.push({
        key: `BANK_UNRECONCILED:${tx.id}`,
        checkName: 'Transação bancária pendente de conciliação',
        severity: NotificationSeverity.WARNING,
        description: `Transação ${tx.description} de ${this.toNumber(tx.amount)} permanece sem conciliação há mais de 7 dias.`,
        source: 'bank-transactions',
        entity: 'BankTransaction',
        entityId: tx.id,
        metadata: {
          amount: this.toNumber(tx.amount),
          type: tx.type,
          occurredAt: tx.occurredAt,
        },
      });
    }
  }

  private async pushPayrollFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const employeeModel = (this.prisma as any).employee;
    const payrollModel = (this.prisma as any).payroll;

    if (!employeeModel?.count || !payrollModel?.findFirst) return;

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();

    const activeEmployees = await employeeModel.count({
      where: {
        companyId,
        active: true,
        deletedAt: null,
      },
    });

    if (activeEmployees === 0) {
      findings.push({
        key: 'PAYROLL_NO_ACTIVE_EMPLOYEES',
        checkName: 'Nenhum colaborador ativo',
        severity: NotificationSeverity.INFO,
        description: 'Não há colaboradores ativos cadastrados para a empresa.',
        source: 'employees',
        entity: 'Employee',
        metadata: {
          activeEmployees,
        },
      });
      return;
    }

    const payroll = await payrollModel.findFirst({
      where: {
        companyId,
        month,
        year,
      },
      include: {
        entries: true,
      },
    });

    if (!payroll) {
      findings.push({
        key: `PAYROLL_MISSING:${month}:${year}`,
        checkName: 'Folha da competência atual não gerada',
        severity: NotificationSeverity.WARNING,
        description: `Existem ${activeEmployees} colaboradores ativos, mas a folha ${String(month).padStart(2, '0')}/${year} ainda não foi gerada.`,
        source: 'payrolls',
        entity: 'Payroll',
        metadata: {
          month,
          year,
          activeEmployees,
        },
      });
      return;
    }

    const entriesCount = payroll.entries?.length || 0;

    if (entriesCount < activeEmployees) {
      findings.push({
        key: `PAYROLL_ENTRIES_MISMATCH:${payroll.id}`,
        checkName: 'Folha com quantidade divergente de eventos',
        severity: NotificationSeverity.WARNING,
        description: `Folha ${String(month).padStart(2, '0')}/${year} possui ${entriesCount} eventos para ${activeEmployees} colaboradores ativos.`,
        source: 'payroll-entries',
        entity: 'Payroll',
        entityId: payroll.id,
        metadata: {
          payrollId: payroll.id,
          activeEmployees,
          entriesCount,
        },
      });
    }
  }

  private async pushAccountingFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const model = (this.prisma as any).accountingEntry;
    if (!model?.findMany) return;

    const invalidEntries = await model.findMany({
      where: {
        companyId,
        OR: [{ debitCode: '' }, { creditCode: '' }, { amount: { lte: 0 } }],
      },
      take: 100,
    });

    for (const entry of invalidEntries) {
      findings.push({
        key: `ACCOUNTING_INVALID:${entry.id}`,
        checkName: 'Lançamento contábil com dados inválidos',
        severity: NotificationSeverity.CRITICAL,
        description: `Lançamento ${entry.description} possui conta débito/crédito vazia ou valor inválido.`,
        source: 'accounting-entries',
        entity: 'AccountingEntry',
        entityId: entry.id,
        metadata: {
          debitCode: entry.debitCode,
          creditCode: entry.creditCode,
          amount: this.toNumber(entry.amount),
        },
      });
    }
  }

  private async pushAutomationFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const model = (this.prisma as any).automationJob;
    if (!model?.findMany) return;

    const failedJobs = await model.findMany({
      where: {
        companyId,
        status: 'FAILED',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    for (const job of failedJobs) {
      findings.push({
        key: `AUTOMATION_FAILED:${job.id}`,
        checkName: 'Job de automação com falha',
        severity: NotificationSeverity.WARNING,
        description: `Job ${job.name} falhou. Erro: ${job.error || 'sem detalhe'}.`,
        source: 'automation-jobs',
        entity: 'AutomationJob',
        entityId: job.id,
        metadata: {
          name: job.name,
          type: job.type,
          status: job.status,
          error: job.error,
        },
      });
    }
  }

  private async pushInvoiceFindings(
    companyId: string,
    findings: EngineFinding[],
  ) {
    const model = (this.prisma as any).invoice;
    if (!model?.findMany) return;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const oldPending = await model.findMany({
      where: {
        companyId,
        deletedAt: null,
        issuedAt: { lt: sevenDaysAgo },
        OR: [
          { nfeStatus: 'DRAFT' },
          { nfeStatus: 'PENDING_AUTHORIZATION' },
          { status: 'PENDING' },
        ],
      },
      take: 100,
      orderBy: {
        issuedAt: 'asc',
      },
    });

    for (const invoice of oldPending) {
      findings.push({
        key: `INVOICE_PENDING:${invoice.id}`,
        checkName: 'Nota fiscal pendente há mais de 7 dias',
        severity: NotificationSeverity.WARNING,
        description: `Nota ${invoice.number || invoice.id} permanece pendente desde ${new Date(invoice.issuedAt).toISOString()}.`,
        source: 'invoices',
        entity: 'Invoice',
        entityId: invoice.id,
        metadata: {
          status: invoice.status,
          nfeStatus: invoice.nfeStatus,
          amount: this.toNumber(invoice.amount),
        },
      });
    }
  }

  async runEngine(
    companyId: string,
    dto: RunComplianceEngineDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const findings: EngineFinding[] = [];

    await this.pushCertificateFindings(companyId, findings);
    await this.pushObligationFindings(companyId, findings);
    await this.pushBankingFindings(companyId, findings);
    await this.pushPayrollFindings(companyId, findings);
    await this.pushAccountingFindings(companyId, findings);
    await this.pushAutomationFindings(companyId, findings);
    await this.pushInvoiceFindings(companyId, findings);

    const createChecks = dto.createChecks ?? true;
    const created: any[] = [];
    const skipped: EngineFinding[] = [];

    if (createChecks) {
      for (const finding of findings) {
        const description = this.sourceDescription(finding);

        const existing = await this.complianceCheckModel.findFirst({
          where: {
            companyId,
            checkName: finding.checkName,
            description,
            resolved: false,
          },
        });

        if (existing) {
          skipped.push(finding);
          continue;
        }

        const check = await this.complianceCheckModel.create({
          data: {
            companyId,
            checkName: finding.checkName,
            severity: finding.severity,
            status: ComplianceStatus.OPEN,
            description,
            resolved: false,
          },
        });

        created.push(this.enrichCheck(check));
      }
    }

    if (dto.resolveStaleEngineChecks) {
      const currentDescriptions = new Set(
        findings.map((finding) => this.sourceDescription(finding)),
      );

      const openEngineChecks = await this.complianceCheckModel.findMany({
        where: {
          companyId,
          resolved: false,
          description: {
            contains: '[source:',
          },
        },
        take: 1000,
      });

      for (const check of openEngineChecks) {
        if (
          check.description &&
          !currentDescriptions.has(String(check.description))
        ) {
          await this.complianceCheckModel.update({
            where: { id: check.id },
            data: {
              status: ComplianceStatus.RESOLVED,
              resolved: true,
              resolvedAt: new Date(),
              resolvedBy: this.getUserId(user),
            },
          });
        }
      }
    }

    const activeRules = await this.businessRuleModel.findMany({
      where: {
        companyId,
        enabled: true,
      },
      take: 500,
    });

    if (findings.length > 0 && activeRules.length > 0) {
      await this.businessRuleModel.updateMany({
        where: {
          companyId,
          enabled: true,
        },
        data: {
          lastTriggeredAt: new Date(),
          triggerCount: {
            increment: 1,
          },
        },
      });
    }

    const checksForSummary = await this.complianceCheckModel.findMany({
      where: {
        companyId,
        ...(dto.includeResolved ? {} : { resolved: false }),
      },
      take: 5000,
    });

    const summary = this.buildChecksSummary(checksForSummary);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'compliance-engine',
      action: 'COMPLIANCE_ENGINE_EXECUTED',
      entity: 'ComplianceEngine',
      entityId: companyId,
      payload: {
        findings: findings.length,
        created: created.length,
        skipped: skipped.length,
        activeRules: activeRules.length,
        summary,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Motor de compliance executado com sucesso.',
      companyId,
      findings: this.normalize(findings),
      created: this.normalize(created),
      skipped: this.normalize(skipped),
      totals: {
        findings: findings.length,
        created: created.length,
        skipped: skipped.length,
        activeRules: activeRules.length,
      },
      summary,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async summary(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const [rules, checks] = await Promise.all([
      this.businessRuleModel.findMany({
        where: { companyId },
        take: 5000,
      }),
      this.complianceCheckModel.findMany({
        where: { companyId },
        take: 5000,
      }),
    ]);

    return {
      status: 'OK',
      module: 'compliance-enterprise-summary',
      companyId,
      rules: this.buildRulesSummary(rules),
      checks: this.buildChecksSummary(checks),
      generatedAt: new Date().toISOString(),
    };
  }
}
