'use strict';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { EnterpriseModuleQueryDto } from './dto/enterprise-module-query.dto.js';

type ModuleConfig = {
  slug: string;
  model: string;
  prismaKey: string;
  label: string;
  companyWhere: (companyId: string) => Record<string, unknown>;
  defaultOrderBy?: Record<string, unknown> | Record<string, unknown>[];
  searchableFields?: string[];
  statusField?: string;
};

@Injectable()
export class EnterpriseModulesService {
  private readonly logger = new Logger(EnterpriseModulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly catalog: Record<string, ModuleConfig> = {
    users: {
      slug: 'users',
      model: 'User',
      prismaKey: 'user',
      label: 'Usuários',
      companyWhere: (companyId) => ({
        companies: {
          some: {
            companyId,
            deletedAt: null,
          },
        },
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['name', 'email'],
    },

    companies: {
      slug: 'companies',
      model: 'Company',
      prismaKey: 'company',
      label: 'Empresas',
      companyWhere: (companyId) => ({
        id: companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['name', 'cnpj', 'taxRegime', 'planLevel'],
      statusField: 'active',
    },

    sessions: {
      slug: 'sessions',
      model: 'UserSession',
      prismaKey: 'userSession',
      label: 'Sessões',
      companyWhere: (companyId) => ({
        user: {
          companies: {
            some: {
              companyId,
              deletedAt: null,
            },
          },
        },
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['userAgent', 'ipAddress'],
    },

    'company-users': {
      slug: 'company-users',
      model: 'CompanyUser',
      prismaKey: 'companyUser',
      label: 'Usuários por Empresa',
      companyWhere: (companyId) => ({
        companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { createdAt: 'desc' },
      statusField: 'role',
    },

    notifications: {
      slug: 'notifications',
      model: 'NotificationLog',
      prismaKey: 'notificationLog',
      label: 'Notificações',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['title', 'message'],
      statusField: 'status',
    },

    invoices: {
      slug: 'invoices',
      model: 'Invoice',
      prismaKey: 'invoice',
      label: 'Notas Fiscais',
      companyWhere: (companyId) => ({
        companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { issuedAt: 'desc' },
      searchableFields: ['accessKey', 'number', 'serie'],
      statusField: 'nfeStatus',
    },

    'sefaz-events': {
      slug: 'sefaz-events',
      model: 'InvoiceSefazEvent',
      prismaKey: 'invoiceSefazEvent',
      label: 'Eventos SEFAZ',
      companyWhere: (companyId) => ({
        invoice: {
          companyId,
        },
      }),
      defaultOrderBy: { occurredAt: 'desc' },
      searchableFields: ['protocol', 'message', 'statusCode'],
      statusField: 'event',
    },

    'tax-obligations': {
      slug: 'tax-obligations',
      model: 'TaxObligation',
      prismaKey: 'taxObligation',
      label: 'Obrigações Tributárias',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { dueDate: 'asc' },
      searchableFields: ['name'],
      statusField: 'status',
    },

    'tax-calculations': {
      slug: 'tax-calculations',
      model: 'TaxCalculation',
      prismaKey: 'taxCalculation',
      label: 'Cálculos Tributários',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: [{ year: 'desc' }, { month: 'desc' }],
    },

    'fiscal-obligations': {
      slug: 'fiscal-obligations',
      model: 'FiscalObligation',
      prismaKey: 'fiscalObligation',
      label: 'Obrigações Fiscais',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { dueDate: 'asc' },
      statusField: 'status',
    },

    'bank-accounts': {
      slug: 'bank-accounts',
      model: 'BankAccount',
      prismaKey: 'bankAccount',
      label: 'Contas Bancárias',
      companyWhere: (companyId) => ({
        companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['bankName', 'agency', 'account'],
    },

    'bank-transactions': {
      slug: 'bank-transactions',
      model: 'BankTransaction',
      prismaKey: 'bankTransaction',
      label: 'Transações Bancárias',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { occurredAt: 'desc' },
      searchableFields: ['description'],
      statusField: 'type',
    },

    'balance-locks': {
      slug: 'balance-locks',
      model: 'BalanceLock',
      prismaKey: 'balanceLock',
      label: 'Travas de Competência',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { lockedAt: 'desc' },
    },

    customers: {
      slug: 'customers',
      model: 'Customer',
      prismaKey: 'customer',
      label: 'Clientes',
      companyWhere: (companyId) => ({
        companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['name', 'document', 'email'],
      statusField: 'active',
    },

    contracts: {
      slug: 'contracts',
      model: 'Contract',
      prismaKey: 'contract',
      label: 'Contratos',
      companyWhere: (companyId) => ({
        companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['description'],
      statusField: 'status',
    },

    'financial-events': {
      slug: 'financial-events',
      model: 'FinancialEvent',
      prismaKey: 'financialEvent',
      label: 'Eventos Financeiros',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { occurredAt: 'desc' },
      searchableFields: ['description', 'referenceId', 'referenceType'],
      statusField: 'type',
    },

    'financial-snapshots': {
      slug: 'financial-snapshots',
      model: 'FinancialSnapshot',
      prismaKey: 'financialSnapshot',
      label: 'Snapshots Financeiros',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: [{ year: 'desc' }, { month: 'desc' }],
    },

    'cash-flow-projections': {
      slug: 'cash-flow-projections',
      model: 'CashFlowProjection',
      prismaKey: 'cashFlowProjection',
      label: 'Projeção de Caixa',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { projectionDate: 'desc' },
    },

    'account-plan': {
      slug: 'account-plan',
      model: 'AccountPlan',
      prismaKey: 'accountPlan',
      label: 'Plano de Contas',
      companyWhere: (companyId) => ({
        OR: [{ companyId }, { companyId: null }],
      }),
      defaultOrderBy: { code: 'asc' },
      searchableFields: ['code', 'name', 'parentCode'],
      statusField: 'type',
    },

    'accounting-entries': {
      slug: 'accounting-entries',
      model: 'AccountingEntry',
      prismaKey: 'accountingEntry',
      label: 'Lançamentos Contábeis',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { date: 'desc' },
      searchableFields: ['description', 'debitCode', 'creditCode'],
      statusField: 'origin',
    },

    employees: {
      slug: 'employees',
      model: 'Employee',
      prismaKey: 'employee',
      label: 'Funcionários',
      companyWhere: (companyId) => ({
        companyId,
        deletedAt: null,
      }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['name', 'cpf', 'pis', 'role'],
      statusField: 'regime',
    },

    payrolls: {
      slug: 'payrolls',
      model: 'Payroll',
      prismaKey: 'payroll',
      label: 'Folha Mensal',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: [{ year: 'desc' }, { month: 'desc' }],
    },

    'payroll-entries': {
      slug: 'payroll-entries',
      model: 'PayrollEntry',
      prismaKey: 'payrollEntry',
      label: 'Lançamentos de Folha',
      companyWhere: (companyId) => ({
        payroll: {
          companyId,
        },
      }),
      defaultOrderBy: { createdAt: 'desc' },
    },

    'compliance-checks': {
      slug: 'compliance-checks',
      model: 'ComplianceCheck',
      prismaKey: 'complianceCheck',
      label: 'Compliance Fiscal',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['checkName', 'description'],
      statusField: 'status',
    },

    'automation-jobs': {
      slug: 'automation-jobs',
      model: 'AutomationJob',
      prismaKey: 'automationJob',
      label: 'Automações',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['name', 'type', 'error'],
      statusField: 'status',
    },

    'business-rules': {
      slug: 'business-rules',
      model: 'BusinessRule',
      prismaKey: 'businessRule',
      label: 'Regras de Negócio',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['name', 'description'],
      statusField: 'enabled',
    },

    'digital-certificates': {
      slug: 'digital-certificates',
      model: 'DigitalCertificate',
      prismaKey: 'digitalCertificate',
      label: 'Certificados Digitais',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { validTo: 'asc' },
      searchableFields: ['issuer', 'thumbprint', 'serialNumber'],
      statusField: 'status',
    },

    webhooks: {
      slug: 'webhooks',
      model: 'WebhookConfig',
      prismaKey: 'webhookConfig',
      label: 'Webhooks',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['url'],
      statusField: 'active',
    },

    'audit-logs': {
      slug: 'audit-logs',
      model: 'AuditLog',
      prismaKey: 'auditLog',
      label: 'Auditoria',
      companyWhere: (companyId) => ({ companyId }),
      defaultOrderBy: { createdAt: 'desc' },
      searchableFields: ['action', 'module', 'entity', 'entityId'],
      statusField: 'module',
    },
  };

  listCatalog() {
    return Object.values(this.catalog).map((item) => ({
      slug: item.slug,
      model: item.model,
      label: item.label,
    }));
  }

  private getConfig(slug: string): ModuleConfig {
    const config = this.catalog[slug];

    if (!config) {
      throw new NotFoundException(`Módulo enterprise não mapeado: ${slug}`);
    }

    return config;
  }

  private getModel(config: ModuleConfig) {
    const model = (this.prisma as any)[config.prismaKey];

    if (!model) {
      throw new NotFoundException(
        `Modelo Prisma não encontrado para ${config.slug}: ${config.prismaKey}`,
      );
    }

    return model;
  }

  private toDate(value?: string, field = 'date'): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} inválido.`);
    }

    return parsed;
  }

  private normalize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map((item) => this.normalize(item));

    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};

      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = this.normalize(innerValue);
      }

      return output;
    }

    return value;
  }

  private resolveDateField(slug: string): string {
    if (slug === 'sefaz-events') return 'occurredAt';
    if (slug === 'bank-transactions') return 'occurredAt';
    if (slug === 'financial-events') return 'occurredAt';
    if (slug === 'cash-flow-projections') return 'projectionDate';
    if (slug === 'accounting-entries') return 'date';
    if (slug === 'tax-obligations') return 'dueDate';
    if (slug === 'fiscal-obligations') return 'dueDate';
    if (slug === 'digital-certificates') return 'validTo';
    if (slug === 'invoices') return 'issuedAt';

    return 'createdAt';
  }

  private coerceStatus(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }

  private buildWhere(
    config: ModuleConfig,
    companyId: string,
    query: EnterpriseModuleQueryDto,
  ) {
    const baseWhere = config.companyWhere(companyId);
    const andConditions: Record<string, unknown>[] = [baseWhere];

    if (query.status && config.statusField) {
      andConditions.push({
        [config.statusField]: this.coerceStatus(query.status),
      });
    }

    if (query.search && config.searchableFields?.length) {
      andConditions.push({
        OR: config.searchableFields.map((field) => ({
          [field]: {
            contains: query.search,
            mode: 'insensitive',
          },
        })),
      });
    }

    const from = this.toDate(query.from, 'from');
    const to = this.toDate(query.to, 'to');

    if (from || to) {
      const dateField = this.resolveDateField(config.slug);

      andConditions.push({
        [dateField]: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }

    if (andConditions.length === 1) return baseWhere;

    return {
      AND: andConditions,
    };
  }

  private includeForSlug(slug: string) {
    if (slug === 'company-users') {
      return {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            active: true,
            twoFactor: true,
          },
        },
      };
    }

    if (slug === 'sessions') {
      return {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            active: true,
          },
        },
      };
    }

    if (slug === 'invoices') {
      return {
        customer: {
          select: {
            id: true,
            name: true,
            document: true,
          },
        },
      };
    }

    if (slug === 'sefaz-events') {
      return {
        invoice: {
          select: {
            id: true,
            number: true,
            accessKey: true,
            companyId: true,
          },
        },
      };
    }

    if (slug === 'payroll-entries') {
      return {
        employee: {
          select: {
            id: true,
            name: true,
            cpf: true,
            role: true,
          },
        },
        payroll: {
          select: {
            id: true,
            companyId: true,
            month: true,
            year: true,
          },
        },
      };
    }

    return undefined;
  }

  private async safeStatusSummary(
    model: any,
    config: ModuleConfig,
    where: Record<string, unknown>,
  ) {
    if (!config.statusField) return {};

    try {
      const grouped = await model.groupBy({
        by: [config.statusField],
        where,
        _count: {
          _all: true,
        },
      });

      return grouped.reduce((acc: Record<string, number>, row: any) => {
        const key = String(row[config.statusField as string]);
        acc[key] = row._count?._all ?? 0;
        return acc;
      }, {});
    } catch (error) {
      this.logger.warn(
        `[EnterpriseModules] groupBy falhou para ${config.slug}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {};
    }
  }

  private buildFinancialSummary(slug: string, items: any[]) {
    const amountKeys = [
      'amount',
      'taxAmount',
      'totalAmount',
      'revenue',
      'expenses',
      'taxPayable',
      'netProfit',
      'balanceCache',
      'baseSalary',
      'netSalary',
      'proLaboreAmount',
      'salariesAmount',
    ];

    const totals: Record<string, number> = {};

    for (const item of items) {
      for (const key of amountKeys) {
        const value = item?.[key];

        if (value === undefined || value === null) continue;

        const numeric =
          value instanceof Prisma.Decimal ? value.toNumber() : Number(value);

        if (Number.isFinite(numeric)) {
          totals[key] = (totals[key] || 0) + numeric;
        }
      }
    }

    return {
      slug,
      totals,
    };
  }

  async list(
    slug: string,
    companyId: string,
    query: EnterpriseModuleQueryDto = {},
  ) {
    const config = this.getConfig(slug);
    const model = this.getModel(config);
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildWhere(config, companyId, query);
    const include = this.includeForSlug(slug);

    const rows = await model.findMany({
      where,
      ...(include ? { include } : {}),
      orderBy: config.defaultOrderBy || { createdAt: 'desc' },
      take: limit + 1,
      skip: offset,
    });

    const sliced = Array.isArray(rows) ? rows.slice(0, limit) : [];
    const normalizedItems = this.normalize(sliced) as unknown[];
    const statusSummary = await this.safeStatusSummary(model, config, where);
    const financialSummary = this.buildFinancialSummary(slug, sliced);

    return {
      slug,
      model: config.model,
      label: config.label,
      companyId,
      status: 'OK',
      items: normalizedItems,
      total: offset + sliced.length,
      limit,
      offset,
      hasMore: Array.isArray(rows) ? rows.length > limit : false,
      summary: {
        count: sliced.length,
        status: statusSummary,
        ...financialSummary,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async summary(
    slug: string,
    companyId: string,
    query: EnterpriseModuleQueryDto = {},
  ) {
    const result = await this.list(slug, companyId, {
      ...query,
      limit: Math.min(Number(query.limit || 100), 100),
      offset: 0,
    });

    return {
      slug: result.slug,
      model: result.model,
      label: result.label,
      companyId,
      status: result.status,
      total: result.total,
      hasMore: result.hasMore,
      summary: result.summary,
      latest: result.items.slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }

  async health(slug: string, companyId: string) {
    const config = this.getConfig(slug);
    const model = this.getModel(config);
    const where = config.companyWhere(companyId);

    let count = 0;

    try {
      count = await model.count({ where });
    } catch (error) {
      this.logger.warn(
        `[EnterpriseModules] count falhou para ${slug}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      slug,
      model: config.model,
      label: config.label,
      companyId,
      status: 'OK',
      count,
      generatedAt: new Date().toISOString(),
    };
  }
}
