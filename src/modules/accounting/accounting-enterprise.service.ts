'use strict';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, EntryOrigin, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateAccountPlanDto } from './dto/create-account-plan.dto.js';
import { CreateAccountingEntryDto } from './dto/create-accounting-entry.dto.js';
import { LockPeriodDto } from './dto/lock-period.dto.js';
import { QueryAccountingDto } from './dto/query-accounting.dto.js';
import { UpdateAccountPlanDto } from './dto/update-account-plan.dto.js';
import { UpdateAccountingEntryDto } from './dto/update-accounting-entry.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  companyId?: string;
  [key: string]: unknown;
};

@Injectable()
export class AccountingEnterpriseService {
  private readonly logger = new Logger(AccountingEnterpriseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get accountPlanModel() {
    const model = (this.prisma as any).accountPlan;

    if (!model) {
      throw new NotFoundException('Modelo Prisma accountPlan não encontrado.');
    }

    return model;
  }

  private get accountingEntryModel() {
    const model = (this.prisma as any).accountingEntry;

    if (!model) {
      throw new NotFoundException(
        'Modelo Prisma accountingEntry não encontrado.',
      );
    }

    return model;
  }

  private get balanceLockModel() {
    const model = (this.prisma as any).balanceLock;

    if (!model) {
      throw new NotFoundException('Modelo Prisma balanceLock não encontrado.');
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

  private validateWritePermission(user?: AuthUser) {
    const role = String(user?.role || '').toUpperCase();

    const allowedRoles = [
      'OWNER',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (role && !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Perfil sem permissão para gerenciar contabilidade.',
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
      const output: Record<string, unknown> = {};

      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = this.normalize(innerValue);
      }

      return output;
    }

    return value;
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} inválido.`);
    }

    return parsed;
  }

  private getMonthYear(date: Date) {
    return {
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
    };
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

  private async assertPeriodUnlocked(
    companyId: string,
    month: number,
    year: number,
  ) {
    const lock = await this.balanceLockModel.findFirst({
      where: {
        companyId,
        month,
        year,
      },
    });

    if (lock) {
      throw new ConflictException(
        `Período contábil bloqueado para ${String(month).padStart(2, '0')}/${year}.`,
      );
    }
  }

  private async validateAccountExists(
    companyId: string,
    code: string,
    label: string,
  ) {
    const account = await this.accountPlanModel.findFirst({
      where: {
        code,
        active: true,
        OR: [
          {
            companyId,
          },
          {
            companyId: null,
          },
        ],
      },
      orderBy: {
        companyId: 'desc',
      },
    });

    if (!account) {
      throw new BadRequestException(
        `${label} inválida: conta ${code} não existe ou está inativa.`,
      );
    }

    return account;
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    module: 'account-plan' | 'accounting-entries' | 'balance-locks';
    action: string;
    entity: 'AccountPlan' | 'AccountingEntry' | 'BalanceLock';
    entityId?: string | null;
    payload?: Record<string, unknown>;
    statusCode?: number | null;
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
      source: 'accounting-enterprise',
      severity: params.statusCode && params.statusCode >= 400 ? 'WARN' : 'INFO',
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
        label: 'scalar-minimal',
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

    for (const candidate of candidates) {
      try {
        await auditLog.create({
          data: candidate.data,
        });

        return {
          recorded: true,
        };
      } catch (error) {
        errors.push(
          `[${candidate.label}] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const lastError =
      errors[errors.length - 1] ||
      errors[0] ||
      'Falha desconhecida ao gravar AuditLog.';

    this.logger.warn(`[AccountingEnterprise] AuditLog skipped: ${lastError}`);

    return {
      recorded: false,
      error: lastError,
    };
  }

  private buildAccountPlanWhere(companyId: string, query: QueryAccountingDto) {
    const andConditions: Record<string, unknown>[] = [
      {
        OR: [
          {
            companyId,
          },
          {
            companyId: null,
          },
        ],
      },
    ];

    if (query.type && query.type !== 'ALL') {
      andConditions.push({
        type: query.type,
      });
    }

    if (query.code) {
      andConditions.push({
        code: query.code,
      });
    }

    if (query.search) {
      andConditions.push({
        OR: [
          {
            code: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            name: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            parentCode: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return {
      AND: andConditions,
    };
  }

  private buildEntryWhere(companyId: string, query: QueryAccountingDto) {
    const andConditions: Record<string, unknown>[] = [{ companyId }];

    if (query.month) andConditions.push({ month: query.month });
    if (query.year) andConditions.push({ year: query.year });

    if (query.origin && query.origin !== 'ALL') {
      andConditions.push({
        origin: query.origin,
      });
    }

    if (query.referenceType) {
      andConditions.push({
        referenceType: query.referenceType,
      });
    }

    if (query.referenceId) {
      andConditions.push({
        referenceId: query.referenceId,
      });
    }

    if (query.from || query.to) {
      const date: Record<string, Date> = {};

      if (query.from) date.gte = this.parseDate(query.from, 'from');
      if (query.to) date.lte = this.parseDate(query.to, 'to');

      andConditions.push({ date });
    }

    if (query.search) {
      andConditions.push({
        OR: [
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            debitCode: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            creditCode: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            referenceType: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            referenceId: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return andConditions.length === 1 ? { companyId } : { AND: andConditions };
  }

  private enrichPlan(item: any) {
    return {
      ...item,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      scope: item.companyId ? 'COMPANY' : 'GLOBAL',
    };
  }

  private enrichEntry(item: any) {
    return {
      ...item,
      date: item.date ? new Date(item.date).toISOString() : null,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      amount:
        item.amount instanceof Prisma.Decimal
          ? item.amount.toNumber()
          : Number(item.amount || 0),
      periodLabel: `${String(item.month).padStart(2, '0')}/${item.year}`,
    };
  }

  private buildPlanSummary(items: any[]) {
    const summary = {
      count: items.length,
      active: 0,
      inactive: 0,
      companySpecific: 0,
      global: 0,
      type: {} as Record<string, number>,
    };

    for (const item of items) {
      const type = String(item.type || 'UNKNOWN');

      summary.type[type] = (summary.type[type] || 0) + 1;

      if (item.active) summary.active += 1;
      else summary.inactive += 1;

      if (item.companyId) summary.companySpecific += 1;
      else summary.global += 1;
    }

    return summary;
  }

  private buildEntrySummary(items: any[]) {
    const summary = {
      count: items.length,
      totalDebit: 0,
      totalCredit: 0,
      totalAmount: 0,
      locked: 0,
      unlocked: 0,
      byOrigin: {} as Record<string, number>,
      byMonth: {} as Record<string, number>,
      byDebitCode: {} as Record<string, number>,
      byCreditCode: {} as Record<string, number>,
      balanced: true,
    };

    for (const item of items) {
      const amount = Number(item.amount || 0);
      const origin = String(item.origin || 'UNKNOWN');
      const period = `${String(item.month).padStart(2, '0')}/${item.year}`;

      summary.totalDebit += amount;
      summary.totalCredit += amount;
      summary.totalAmount += amount;
      summary.byOrigin[origin] = (summary.byOrigin[origin] || 0) + 1;
      summary.byMonth[period] = (summary.byMonth[period] || 0) + 1;
      summary.byDebitCode[item.debitCode] =
        (summary.byDebitCode[item.debitCode] || 0) + amount;
      summary.byCreditCode[item.creditCode] =
        (summary.byCreditCode[item.creditCode] || 0) + amount;

      if (item.locked) summary.locked += 1;
      else summary.unlocked += 1;
    }

    summary.balanced =
      Number(summary.totalDebit.toFixed(2)) ===
      Number(summary.totalCredit.toFixed(2));

    return summary;
  }

  async listAccountPlan(
    companyId: string,
    query: QueryAccountingDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildAccountPlanWhere(companyId, query);

    const rows = await this.accountPlanModel.findMany({
      where,
      orderBy: [
        {
          code: 'asc',
        },
      ],
      take: limit + 1,
      skip: offset,
    });

    const items = rows
      .slice(0, limit)
      .map((item: any) => this.enrichPlan(item));

    return {
      status: 'OK',
      module: 'account-plan',
      model: 'AccountPlan',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildPlanSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createAccountPlan(
    companyId: string,
    dto: CreateAccountPlanDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const code = dto.code.trim();

    const existing = await this.accountPlanModel.findFirst({
      where: {
        companyId,
        code,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Conta contábil ${code} já existe para esta empresa.`,
      );
    }

    if (dto.parentCode) {
      await this.validateAccountExists(
        companyId,
        dto.parentCode.trim(),
        'parentCode',
      );
    }

    const created = await this.accountPlanModel.create({
      data: {
        companyId,
        code,
        name: dto.name.trim(),
        type: dto.type as AccountType,
        parentCode: dto.parentCode?.trim() || null,
        active: dto.active ?? true,
      },
    });

    const enriched = this.enrichPlan(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'account-plan',
      action: 'ACCOUNT_PLAN_CREATED',
      entity: 'AccountPlan',
      entityId: created.id,
      payload: {
        accountId: created.id,
        item: this.normalize(enriched),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Conta contábil criada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateAccountPlan(
    companyId: string,
    accountId: string,
    dto: UpdateAccountPlanDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.accountPlanModel.findFirst({
      where: {
        id: accountId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Conta contábil não encontrada: ${accountId}`,
      );
    }

    if (dto.parentCode) {
      await this.validateAccountExists(
        companyId,
        dto.parentCode.trim(),
        'parentCode',
      );
    }

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.parentCode !== undefined)
      data.parentCode = dto.parentCode?.trim() || null;
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.accountPlanModel.update({
      where: {
        id: accountId,
      },
      data,
    });

    const enriched = this.enrichPlan(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'account-plan',
      action: 'ACCOUNT_PLAN_UPDATED',
      entity: 'AccountPlan',
      entityId: accountId,
      payload: {
        before: this.normalize(this.enrichPlan(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Conta contábil atualizada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async deactivateAccountPlan(
    companyId: string,
    accountId: string,
    user?: AuthUser,
  ) {
    return this.updateAccountPlan(
      companyId,
      accountId,
      {
        active: false,
      },
      user,
    );
  }

  async seedDefaultAccountPlan(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const defaults: CreateAccountPlanDto[] = [
      { code: '1.1.01', name: 'Caixa e equivalentes', type: 'ATIVO' },
      { code: '1.1.02', name: 'Bancos conta movimento', type: 'ATIVO' },
      { code: '1.1.03', name: 'Clientes a receber', type: 'ATIVO' },
      { code: '2.1.01', name: 'Fornecedores', type: 'PASSIVO' },
      { code: '2.1.02', name: 'Obrigações tributárias', type: 'PASSIVO' },
      { code: '3.1.01', name: 'Capital social', type: 'PATRIMONIO_LIQUIDO' },
      { code: '4.1.01', name: 'Receita de serviços', type: 'RECEITA' },
      { code: '5.1.01', name: 'Despesas administrativas', type: 'DESPESA' },
      { code: '5.1.02', name: 'Despesas tributárias', type: 'DESPESA' },
      { code: '6.1.01', name: 'Custos operacionais', type: 'CUSTO' },
    ];

    const results: Array<{
      code: string;
      status: 'CREATED' | 'SKIPPED';
      id?: string;
    }> = [];

    for (const item of defaults) {
      const existing = await this.accountPlanModel.findFirst({
        where: {
          companyId,
          code: item.code,
        },
      });

      if (existing) {
        results.push({
          code: item.code,
          status: 'SKIPPED',
          id: existing.id,
        });
        continue;
      }

      const created = await this.accountPlanModel.create({
        data: {
          companyId,
          code: item.code,
          name: item.name,
          type: item.type as AccountType,
          parentCode: item.parentCode || null,
          active: true,
        },
      });

      results.push({
        code: item.code,
        status: 'CREATED',
        id: created.id,
      });
    }

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'account-plan',
      action: 'ACCOUNT_PLAN_DEFAULT_SEEDED',
      entity: 'AccountPlan',
      entityId: null,
      payload: {
        results,
        created: results.filter((item) => item.status === 'CREATED').length,
        skipped: results.filter((item) => item.status === 'SKIPPED').length,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Plano de contas base aplicado com sucesso.',
      companyId,
      results,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async listEntries(
    companyId: string,
    query: QueryAccountingDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildEntryWhere(companyId, query);

    const rows = await this.accountingEntryModel.findMany({
      where,
      orderBy: [
        {
          date: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      take: limit + 1,
      skip: offset,
    });

    const items = rows
      .slice(0, limit)
      .map((item: any) => this.enrichEntry(item));

    return {
      status: 'OK',
      module: 'accounting-entries',
      model: 'AccountingEntry',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildEntrySummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createEntry(
    companyId: string,
    dto: CreateAccountingEntryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const date = this.parseDate(dto.date, 'date');
    const { month, year } = this.getMonthYear(date);

    await this.assertPeriodUnlocked(companyId, month, year);

    const debitCode = dto.debitCode.trim();
    const creditCode = dto.creditCode.trim();

    if (debitCode === creditCode) {
      throw new BadRequestException(
        'Conta de débito e crédito não podem ser iguais.',
      );
    }

    await this.validateAccountExists(companyId, debitCode, 'debitCode');
    await this.validateAccountExists(companyId, creditCode, 'creditCode');

    const created = await this.accountingEntryModel.create({
      data: {
        companyId,
        date,
        description: dto.description.trim(),
        debitCode,
        creditCode,
        amount: dto.amount,
        origin: (dto.origin || EntryOrigin.MANUAL) as EntryOrigin,
        referenceId: dto.referenceId?.trim() || null,
        referenceType: dto.referenceType?.trim() || null,
        month,
        year,
        locked: false,
      },
    });

    const enriched = this.enrichEntry(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'accounting-entries',
      action: 'ACCOUNTING_ENTRY_CREATED',
      entity: 'AccountingEntry',
      entityId: created.id,
      payload: {
        entryId: created.id,
        item: this.normalize(enriched),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Lançamento contábil criado com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async detailEntry(companyId: string, entryId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const item = await this.accountingEntryModel.findFirst({
      where: {
        id: entryId,
        companyId,
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Lançamento contábil não encontrado: ${entryId}`,
      );
    }

    return {
      status: 'OK',
      module: 'accounting-entries',
      model: 'AccountingEntry',
      companyId,
      item: this.normalize(this.enrichEntry(item)),
      generatedAt: new Date().toISOString(),
    };
  }

  async updateEntry(
    companyId: string,
    entryId: string,
    dto: UpdateAccountingEntryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.accountingEntryModel.findFirst({
      where: {
        id: entryId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Lançamento contábil não encontrado: ${entryId}`,
      );
    }

    await this.assertPeriodUnlocked(companyId, current.month, current.year);

    const nextDate = dto.date
      ? this.parseDate(dto.date, 'date')
      : new Date(current.date);
    const nextPeriod = this.getMonthYear(nextDate);

    await this.assertPeriodUnlocked(
      companyId,
      nextPeriod.month,
      nextPeriod.year,
    );

    const nextDebitCode = dto.debitCode?.trim() || current.debitCode;
    const nextCreditCode = dto.creditCode?.trim() || current.creditCode;

    if (nextDebitCode === nextCreditCode) {
      throw new BadRequestException(
        'Conta de débito e crédito não podem ser iguais.',
      );
    }

    await this.validateAccountExists(companyId, nextDebitCode, 'debitCode');
    await this.validateAccountExists(companyId, nextCreditCode, 'creditCode');

    const data: Record<string, unknown> = {
      date: nextDate,
      debitCode: nextDebitCode,
      creditCode: nextCreditCode,
      month: nextPeriod.month,
      year: nextPeriod.year,
    };

    if (dto.description !== undefined)
      data.description = dto.description.trim();
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.origin !== undefined) data.origin = dto.origin;
    if (dto.referenceId !== undefined)
      data.referenceId = dto.referenceId?.trim() || null;
    if (dto.referenceType !== undefined)
      data.referenceType = dto.referenceType?.trim() || null;

    const updated = await this.accountingEntryModel.update({
      where: {
        id: entryId,
      },
      data,
    });

    const enriched = this.enrichEntry(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'accounting-entries',
      action: 'ACCOUNTING_ENTRY_UPDATED',
      entity: 'AccountingEntry',
      entityId: entryId,
      payload: {
        before: this.normalize(this.enrichEntry(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Lançamento contábil atualizado com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async deleteEntry(companyId: string, entryId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.accountingEntryModel.findFirst({
      where: {
        id: entryId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Lançamento contábil não encontrado: ${entryId}`,
      );
    }

    await this.assertPeriodUnlocked(companyId, current.month, current.year);

    await this.accountingEntryModel.delete({
      where: {
        id: entryId,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'accounting-entries',
      action: 'ACCOUNTING_ENTRY_DELETED',
      entity: 'AccountingEntry',
      entityId: entryId,
      payload: {
        deleted: this.normalize(this.enrichEntry(current)),
        warning:
          'Exclusão física realizada porque AccountingEntry não possui deletedAt no schema atual.',
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Lançamento contábil removido com sucesso.',
      companyId,
      deletedId: entryId,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async listLocks(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const rows = await this.balanceLockModel.findMany({
      where: {
        companyId,
      },
      orderBy: [
        {
          year: 'desc',
        },
        {
          month: 'desc',
        },
      ],
      take: 100,
    });

    return {
      status: 'OK',
      module: 'balance-locks',
      model: 'BalanceLock',
      companyId,
      items: this.normalize(rows),
      total: rows.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async lockPeriod(companyId: string, dto: LockPeriodDto, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const lockedBy =
      dto.lockedBy?.trim() || user?.email || user?.id || user?.sub || 'system';

    const existing = await this.balanceLockModel.findFirst({
      where: {
        companyId,
        month: dto.month,
        year: dto.year,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Período ${String(dto.month).padStart(2, '0')}/${dto.year} já está bloqueado.`,
      );
    }

    const lock = await this.balanceLockModel.create({
      data: {
        companyId,
        month: dto.month,
        year: dto.year,
        lockedBy,
      },
    });

    await this.accountingEntryModel.updateMany({
      where: {
        companyId,
        month: dto.month,
        year: dto.year,
      },
      data: {
        locked: true,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'balance-locks',
      action: 'BALANCE_PERIOD_LOCKED',
      entity: 'BalanceLock',
      entityId: lock.id,
      payload: {
        lock: this.normalize(lock),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Período contábil bloqueado com sucesso.',
      companyId,
      item: this.normalize(lock),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async unlockPeriod(
    companyId: string,
    month: number,
    year: number,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const lock = await this.balanceLockModel.findFirst({
      where: {
        companyId,
        month,
        year,
      },
    });

    if (!lock) {
      throw new NotFoundException(
        `Bloqueio contábil não encontrado para ${String(month).padStart(2, '0')}/${year}.`,
      );
    }

    await this.balanceLockModel.delete({
      where: {
        id: lock.id,
      },
    });

    await this.accountingEntryModel.updateMany({
      where: {
        companyId,
        month,
        year,
      },
      data: {
        locked: false,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'balance-locks',
      action: 'BALANCE_PERIOD_UNLOCKED',
      entity: 'BalanceLock',
      entityId: lock.id,
      payload: {
        unlocked: this.normalize(lock),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Período contábil desbloqueado com sucesso.',
      companyId,
      deletedId: lock.id,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }
}
