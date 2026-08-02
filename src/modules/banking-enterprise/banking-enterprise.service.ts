'use strict';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialEventType,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AutoReconciliationEnterpriseDto } from './dto/auto-reconciliation-enterprise.dto.js';
import { BankingEnterpriseQueryDto } from './dto/banking-enterprise-query.dto.js';
import { CreateBankAccountEnterpriseDto } from './dto/create-bank-account-enterprise.dto.js';
import { CreateBankTransactionEnterpriseDto } from './dto/create-bank-transaction-enterprise.dto.js';
import { ManualReconciliationEnterpriseDto } from './dto/manual-reconciliation-enterprise.dto.js';
import { UpdateBankAccountEnterpriseDto } from './dto/update-bank-account-enterprise.dto.js';
import { UpdateBankTransactionEnterpriseDto } from './dto/update-bank-transaction-enterprise.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  companyId?: string;
  [key: string]: unknown;
};

type ReconciliationTargetType = 'INVOICE' | 'TAX_OBLIGATION';

type Candidate = {
  targetType: ReconciliationTargetType;
  targetId: string;
  score: number;
  amountScore: number;
  dateScore: number;
  descriptionScore: number;
  reason: string[];
  target: Record<string, unknown>;
};

@Injectable()
export class BankingEnterpriseService {
  private readonly logger = new Logger(BankingEnterpriseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get bankAccountModel() {
    const model = (this.prisma as any).bankAccount;

    if (!model) {
      throw new NotFoundException('Modelo Prisma bankAccount não encontrado.');
    }

    return model;
  }

  private get bankTransactionModel() {
    const model = (this.prisma as any).bankTransaction;

    if (!model) {
      throw new NotFoundException(
        'Modelo Prisma bankTransaction não encontrado.',
      );
    }

    return model;
  }

  private get financialEventModel() {
    return (this.prisma as any).financialEvent;
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
      'FINANCE',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (role && !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Perfil sem permissão para gerenciar banking enterprise.',
      );
    }
  }

  private parseDate(value: string, field: string): Date {
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

  private toNumber(value: unknown): number {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    return Number(value || 0);
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

  private async assertBankAccount(companyId: string, bankAccountId: string) {
    const account = await this.bankAccountModel.findFirst({
      where: {
        id: bankAccountId,
        companyId,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new NotFoundException(
        `Conta bancária não encontrada: ${bankAccountId}`,
      );
    }

    return account;
  }

  private enrichAccount(account: any) {
    const balance = this.toNumber(account.balanceCache);

    return {
      ...account,
      balanceCache: balance,
      status: account.deletedAt ? 'DELETED' : 'ACTIVE',
      createdAt: account.createdAt ? new Date(account.createdAt).toISOString() : null,
      updatedAt: account.updatedAt ? new Date(account.updatedAt).toISOString() : null,
      deletedAt: account.deletedAt ? new Date(account.deletedAt).toISOString() : null,
    };
  }

  private enrichTransaction(transaction: any) {
    const amount = this.toNumber(transaction.amount);

    return {
      ...transaction,
      amount,
      signedAmount: transaction.type === 'DEBIT' ? -amount : amount,
      occurredAt: transaction.occurredAt
        ? new Date(transaction.occurredAt).toISOString()
        : null,
      createdAt: transaction.createdAt
        ? new Date(transaction.createdAt).toISOString()
        : null,
      reconciliationStatus: transaction.reconciled
        ? transaction.invoiceId
          ? 'RECONCILED_INVOICE'
          : transaction.taxObligationId
            ? 'RECONCILED_TAX'
            : 'RECONCILED_MANUAL'
        : 'PENDING',
    };
  }

  private buildAccountSummary(items: any[]) {
    const summary = {
      count: items.length,
      active: 0,
      deleted: 0,
      totalBalance: 0,
      byBank: {} as Record<string, number>,
    };

    for (const item of items) {
      if (item.deletedAt) summary.deleted += 1;
      else summary.active += 1;

      summary.totalBalance += this.toNumber(item.balanceCache);
      summary.byBank[item.bankName] = (summary.byBank[item.bankName] || 0) + 1;
    }

    summary.totalBalance = Number(summary.totalBalance.toFixed(2));

    return summary;
  }

  private buildTransactionSummary(items: any[]) {
    const summary = {
      count: items.length,
      credits: 0,
      debits: 0,
      totalCredit: 0,
      totalDebit: 0,
      netAmount: 0,
      reconciled: 0,
      pending: 0,
      reconciliationRate: 0,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byBankAccountId: {} as Record<string, number>,
    };

    for (const item of items) {
      const amount = this.toNumber(item.amount);
      const type = String(item.type || 'UNKNOWN');
      const status = item.reconciled ? 'RECONCILED' : 'PENDING';

      summary.byType[type] = (summary.byType[type] || 0) + 1;
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
      summary.byBankAccountId[item.bankAccountId] =
        (summary.byBankAccountId[item.bankAccountId] || 0) + 1;

      if (item.type === 'CREDIT') {
        summary.credits += 1;
        summary.totalCredit += amount;
        summary.netAmount += amount;
      } else {
        summary.debits += 1;
        summary.totalDebit += amount;
        summary.netAmount -= amount;
      }

      if (item.reconciled) summary.reconciled += 1;
      else summary.pending += 1;
    }

    summary.totalCredit = Number(summary.totalCredit.toFixed(2));
    summary.totalDebit = Number(summary.totalDebit.toFixed(2));
    summary.netAmount = Number(summary.netAmount.toFixed(2));
    summary.reconciliationRate =
      summary.count > 0
        ? Number(((summary.reconciled / summary.count) * 100).toFixed(2))
        : 0;

    return summary;
  }

  private buildAccountsWhere(companyId: string, query: BankingEnterpriseQueryDto) {
    const and: Record<string, unknown>[] = [{ companyId }];

    if (query.search) {
      and.push({
        OR: [
          {
            bankName: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            agency: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            account: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return {
      AND: and,
    };
  }

  private buildTransactionsWhere(
    companyId: string,
    query: BankingEnterpriseQueryDto,
  ) {
    const and: Record<string, unknown>[] = [{ companyId }];

    if (query.bankAccountId) and.push({ bankAccountId: query.bankAccountId });
    if (query.type) {
      and.push({ type: query.type });
    }
    if (query.invoiceId) and.push({ invoiceId: query.invoiceId });
    if (query.taxObligationId) and.push({ taxObligationId: query.taxObligationId });

    if (query.reconciled !== undefined) {
      and.push({
        reconciled: query.reconciled === 'true',
      });
    }

    if (query.from || query.to) {
      const occurredAt: Record<string, Date> = {};

      if (query.from) occurredAt.gte = this.parseDate(query.from, 'from');
      if (query.to) occurredAt.lte = this.parseDate(query.to, 'to');

      and.push({ occurredAt });
    }

    if (query.search) {
      and.push({
        OR: [
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            invoiceId: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            taxObligationId: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    module: 'bank-accounts' | 'bank-transactions' | 'bank-reconciliation';
    action: string;
    entity: 'BankAccount' | 'BankTransaction';
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
      source: 'banking-enterprise',
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

    const candidates: Array<{ label: string; data: Record<string, unknown> }> = [
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

    this.logger.warn(`[BankingEnterprise] AuditLog skipped: ${lastError}`);

    return {
      recorded: false,
      error: lastError,
    };
  }

  private async createFinancialEventForReconciliation(params: {
    companyId: string;
    transaction: any;
    targetType: ReconciliationTargetType;
    targetId: string;
    note?: string;
  }) {
    if (!this.financialEventModel?.create) {
      return {
        recorded: false,
        error: 'financialEvent indisponível no PrismaService.',
      };
    }

    try {
      const occurredAt = new Date(params.transaction.occurredAt);
      const { month, year } = this.getMonthYear(occurredAt);

      const type =
        params.targetType === 'INVOICE'
          ? FinancialEventType.PAYMENT_RECEIVED
          : FinancialEventType.TAX_PAID;

      const event = await this.financialEventModel.create({
        data: {
          companyId: params.companyId,
          type,
          amount: params.transaction.amount,
          description:
            params.note ||
            `Conciliação ${params.targetType} via transação bancária ${params.transaction.id}`,
          referenceId: params.targetId,
          referenceType: params.targetType,
          month,
          year,
          occurredAt,
          metadata: {
            bankTransactionId: params.transaction.id,
            bankAccountId: params.transaction.bankAccountId,
            targetType: params.targetType,
            source: 'banking-enterprise-reconciliation',
          },
        },
      });

      return {
        recorded: true,
        event: this.normalize(event),
      };
    } catch (error) {
      return {
        recorded: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listAccounts(
    companyId: string,
    query: BankingEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildAccountsWhere(companyId, query);

    const rows = await this.bankAccountModel.findMany({
      where,
      orderBy: [
        {
          deletedAt: 'asc',
        },
        {
          bankName: 'asc',
        },
      ],
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item: any) => this.enrichAccount(item));

    return {
      status: 'OK',
      module: 'bank-accounts',
      model: 'BankAccount',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildAccountSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createAccount(
    companyId: string,
    dto: CreateBankAccountEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const existing = await this.bankAccountModel.findFirst({
      where: {
        companyId,
        bankName: dto.bankName.trim(),
        agency: dto.agency.trim(),
        account: dto.account.trim(),
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Conta bancária ativa já existe para este banco/agência/conta.',
      );
    }

    const created = await this.bankAccountModel.create({
      data: {
        companyId,
        bankName: dto.bankName.trim(),
        agency: dto.agency.trim(),
        account: dto.account.trim(),
        balanceCache: dto.balanceCache ?? 0,
      },
    });

    const enriched = this.enrichAccount(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-accounts',
      action: 'BANK_ACCOUNT_CREATED',
      entity: 'BankAccount',
      entityId: created.id,
      payload: {
        item: this.normalize(enriched),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Conta bancária criada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateAccount(
    companyId: string,
    bankAccountId: string,
    dto: UpdateBankAccountEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.assertBankAccount(companyId, bankAccountId);

    const data: Record<string, unknown> = {};

    if (dto.bankName !== undefined) data.bankName = dto.bankName.trim();
    if (dto.agency !== undefined) data.agency = dto.agency.trim();
    if (dto.account !== undefined) data.account = dto.account.trim();
    if (dto.balanceCache !== undefined) data.balanceCache = dto.balanceCache;

    const updated = await this.bankAccountModel.update({
      where: {
        id: bankAccountId,
      },
      data,
    });

    const enriched = this.enrichAccount(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-accounts',
      action: 'BANK_ACCOUNT_UPDATED',
      entity: 'BankAccount',
      entityId: bankAccountId,
      payload: {
        before: this.normalize(this.enrichAccount(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Conta bancária atualizada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async deactivateAccount(
    companyId: string,
    bankAccountId: string,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.assertBankAccount(companyId, bankAccountId);

    const pending = await this.bankTransactionModel.count({
      where: {
        companyId,
        bankAccountId,
        reconciled: false,
      },
    });

    if (pending > 0) {
      throw new ConflictException(
        `Conta bancária possui ${pending} transação(ões) pendente(s) de conciliação.`,
      );
    }

    const updated = await this.bankAccountModel.update({
      where: {
        id: bankAccountId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-accounts',
      action: 'BANK_ACCOUNT_DEACTIVATED',
      entity: 'BankAccount',
      entityId: bankAccountId,
      payload: {
        before: this.normalize(this.enrichAccount(current)),
        after: this.normalize(this.enrichAccount(updated)),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Conta bancária desativada com sucesso.',
      companyId,
      item: this.normalize(this.enrichAccount(updated)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async listTransactions(
    companyId: string,
    query: BankingEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildTransactionsWhere(companyId, query);

    const rows = await this.bankTransactionModel.findMany({
      where,
      include: {
        bankAccount: true,
        invoice: true,
        taxObligation: true,
      },
      orderBy: [
        {
          occurredAt: 'desc',
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
      .map((item: any) => this.enrichTransaction(item));

    return {
      status: 'OK',
      module: 'bank-transactions',
      model: 'BankTransaction',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildTransactionSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createTransaction(
    companyId: string,
    dto: CreateBankTransactionEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);
    await this.assertBankAccount(companyId, dto.bankAccountId);

    const occurredAt = this.parseDate(dto.occurredAt, 'occurredAt');

    const created = await this.bankTransactionModel.create({
      data: {
        companyId,
        bankAccountId: dto.bankAccountId,
        type: dto.type as TransactionType,
        amount: dto.amount,
        description: dto.description.trim(),
        occurredAt,
        metadata: {
          ...(dto.metadata || {}),
          source: 'banking-enterprise-manual',
        },
      },
      include: {
        bankAccount: true,
        invoice: true,
        taxObligation: true,
      },
    });

    const enriched = this.enrichTransaction(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-transactions',
      action: 'BANK_TRANSACTION_CREATED',
      entity: 'BankTransaction',
      entityId: created.id,
      payload: {
        item: this.normalize(enriched),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Transação bancária criada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateTransaction(
    companyId: string,
    transactionId: string,
    dto: UpdateBankTransactionEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.bankTransactionModel.findFirst({
      where: {
        id: transactionId,
        companyId,
      },
      include: {
        bankAccount: true,
        invoice: true,
        taxObligation: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Transação bancária não encontrada: ${transactionId}`);
    }

    if (current.reconciled) {
      throw new ConflictException(
        'Transação conciliada não pode ser alterada. Desfaça a conciliação primeiro.',
      );
    }

    const data: Record<string, unknown> = {
      version: {
        increment: 1,
      },
    };

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.occurredAt !== undefined) {
      data.occurredAt = this.parseDate(dto.occurredAt, 'occurredAt');
    }

    if (dto.metadata !== undefined) {
      data.metadata = {
        ...(current.metadata || {}),
        ...dto.metadata,
        updatedBy: 'banking-enterprise',
        updatedAt: new Date().toISOString(),
      };
    }

    const updated = await this.bankTransactionModel.update({
      where: {
        id: transactionId,
      },
      data,
      include: {
        bankAccount: true,
        invoice: true,
        taxObligation: true,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-transactions',
      action: 'BANK_TRANSACTION_UPDATED',
      entity: 'BankTransaction',
      entityId: transactionId,
      payload: {
        before: this.normalize(this.enrichTransaction(current)),
        after: this.normalize(this.enrichTransaction(updated)),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Transação bancária atualizada com sucesso.',
      companyId,
      item: this.normalize(this.enrichTransaction(updated)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async detailTransaction(companyId: string, transactionId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const item = await this.bankTransactionModel.findFirst({
      where: {
        id: transactionId,
        companyId,
      },
      include: {
        bankAccount: true,
        invoice: true,
        taxObligation: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`Transação bancária não encontrada: ${transactionId}`);
    }

    return {
      status: 'OK',
      module: 'bank-transactions',
      model: 'BankTransaction',
      companyId,
      item: this.normalize(this.enrichTransaction(item)),
      generatedAt: new Date().toISOString(),
    };
  }

  private calculateDescriptionScore(source: string, target: string): number {
    const a = source.toLowerCase();
    const b = target.toLowerCase();

    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return 20;

    const aTokens = new Set(a.split(/\W+/).filter(Boolean));
    const bTokens = new Set(b.split(/\W+/).filter(Boolean));

    let common = 0;

    for (const token of aTokens) {
      if (bTokens.has(token)) common += 1;
    }

    if (common === 0) return 0;

    return Math.min(20, common * 5);
  }

  private calculateCandidateScore(params: {
    transactionAmount: number;
    targetAmount: number;
    transactionDate: Date;
    targetDate: Date;
    transactionDescription: string;
    targetDescription: string;
    amountTolerance: number;
    dateToleranceDays: number;
  }) {
    const amountDiff = Math.abs(params.transactionAmount - params.targetAmount);
    const amountScore =
      amountDiff <= params.amountTolerance
        ? 60
        : Math.max(0, 60 - amountDiff);

    const diffMs = Math.abs(
      params.transactionDate.getTime() - params.targetDate.getTime(),
    );
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const dateScore =
      diffDays <= params.dateToleranceDays
        ? Math.max(0, 20 - diffDays)
        : 0;

    const descriptionScore = this.calculateDescriptionScore(
      params.transactionDescription,
      params.targetDescription,
    );

    const score = Math.min(
      100,
      Number((amountScore + dateScore + descriptionScore).toFixed(2)),
    );

    return {
      score,
      amountScore: Number(amountScore.toFixed(2)),
      dateScore: Number(dateScore.toFixed(2)),
      descriptionScore,
      amountDiff: Number(amountDiff.toFixed(2)),
      diffDays: Number(diffDays.toFixed(2)),
    };
  }

  async candidatesForTransaction(
    companyId: string,
    transactionId: string,
    query: AutoReconciliationEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const amountTolerance = Number(query.amountTolerance ?? 0.05);
    const dateToleranceDays = Number(query.dateToleranceDays ?? 15);

    const transaction = await this.bankTransactionModel.findFirst({
      where: {
        id: transactionId,
        companyId,
      },
      include: {
        bankAccount: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transação bancária não encontrada: ${transactionId}`);
    }

    if (transaction.reconciled) {
      return {
        status: 'OK',
        message: 'Transação já conciliada.',
        companyId,
        transaction: this.normalize(this.enrichTransaction(transaction)),
        candidates: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const txAmount = this.toNumber(transaction.amount);
    const txDate = new Date(transaction.occurredAt);
    const candidates: Candidate[] = [];

    if (transaction.type === TransactionType.CREDIT) {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          companyId,
          reconciled: false,
          deletedAt: null,
          amount: {
            gte: new Prisma.Decimal(Math.max(0, txAmount - amountTolerance)),
            lte: new Prisma.Decimal(txAmount + amountTolerance),
          },
        },
        include: {
          customer: true,
        },
        take: 50,
        orderBy: {
          issuedAt: 'desc',
        },
      });

      for (const invoice of invoices) {
        const customerName = (invoice as any).customer?.name || '';
        const targetDescription = `${invoice.number || ''} ${customerName}`;

        const scoring = this.calculateCandidateScore({
          transactionAmount: txAmount,
          targetAmount: this.toNumber(invoice.amount),
          transactionDate: txDate,
          targetDate: new Date(invoice.issuedAt),
          transactionDescription: transaction.description,
          targetDescription,
          amountTolerance,
          dateToleranceDays,
        });

        candidates.push({
          targetType: 'INVOICE',
          targetId: invoice.id,
          score: scoring.score,
          amountScore: scoring.amountScore,
          dateScore: scoring.dateScore,
          descriptionScore: scoring.descriptionScore,
          reason: [
            `Diferença de valor: ${scoring.amountDiff}`,
            `Diferença de dias: ${scoring.diffDays}`,
            'Transação CREDIT compatível com Invoice.',
          ],
          target: this.normalize(invoice) as Record<string, unknown>,
        });
      }
    }

    if (transaction.type === TransactionType.DEBIT) {
      const taxObligations = await (this.prisma as any).taxObligation.findMany({
        where: {
          companyId,
          status: {
            in: ['PENDING', 'OVERDUE', 'PARTIAL'],
          },
          amount: {
            gte: new Prisma.Decimal(Math.max(0, txAmount - amountTolerance)),
            lte: new Prisma.Decimal(txAmount + amountTolerance),
          },
        },
        take: 50,
        orderBy: {
          dueDate: 'desc',
        },
      });

      for (const obligation of taxObligations) {
        const scoring = this.calculateCandidateScore({
          transactionAmount: txAmount,
          targetAmount: this.toNumber(obligation.amount),
          transactionDate: txDate,
          targetDate: new Date(obligation.dueDate),
          transactionDescription: transaction.description,
          targetDescription: obligation.name,
          amountTolerance,
          dateToleranceDays,
        });

        candidates.push({
          targetType: 'TAX_OBLIGATION',
          targetId: obligation.id,
          score: scoring.score,
          amountScore: scoring.amountScore,
          dateScore: scoring.dateScore,
          descriptionScore: scoring.descriptionScore,
          reason: [
            `Diferença de valor: ${scoring.amountDiff}`,
            `Diferença de dias: ${scoring.diffDays}`,
            'Transação DEBIT compatível com TaxObligation.',
          ],
          target: this.normalize(obligation) as Record<string, unknown>,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      status: 'OK',
      module: 'bank-reconciliation',
      companyId,
      transaction: this.normalize(this.enrichTransaction(transaction)),
      candidates,
      total: candidates.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async manualReconcile(
    companyId: string,
    dto: ManualReconciliationEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const transaction = await this.bankTransactionModel.findFirst({
      where: {
        id: dto.bankTransactionId,
        companyId,
      },
      include: {
        invoice: true,
        taxObligation: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transação bancária não encontrada: ${dto.bankTransactionId}`,
      );
    }

    if (transaction.reconciled && !dto.force) {
      throw new ConflictException(
        'Transação já conciliada. Use force=true para substituir.',
      );
    }

    if (dto.targetType === 'INVOICE' && transaction.type !== TransactionType.CREDIT) {
      throw new BadRequestException(
        'Conciliação com Invoice exige transação do tipo CREDIT.',
      );
    }

    if (
      dto.targetType === 'TAX_OBLIGATION' &&
      transaction.type !== TransactionType.DEBIT
    ) {
      throw new BadRequestException(
        'Conciliação com TaxObligation exige transação do tipo DEBIT.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let target: any = null;

      if (dto.targetType === 'INVOICE') {
        target = await tx.invoice.findFirst({
          where: {
            id: dto.targetId,
            companyId,
            deletedAt: null,
          },
        });

        if (!target) {
          throw new NotFoundException(`Invoice não encontrada: ${dto.targetId}`);
        }

        const alreadyLinked = await tx.bankTransaction.findFirst({
          where: {
            companyId,
            invoiceId: dto.targetId,
            id: {
              not: dto.bankTransactionId,
            },
          },
        });

        if (alreadyLinked && !dto.force) {
          throw new ConflictException(
            'Invoice já vinculada a outra transação bancária.',
          );
        }

        await tx.invoice.update({
          where: {
            id: dto.targetId,
          },
          data: {
            reconciled: true,
            status: 'PAID' as any,
            version: {
              increment: 1,
            },
          },
        });
      }

      if (dto.targetType === 'TAX_OBLIGATION') {
        target = await (tx as any).taxObligation.findFirst({
          where: {
            id: dto.targetId,
            companyId,
          },
        });

        if (!target) {
          throw new NotFoundException(
            `TaxObligation não encontrada: ${dto.targetId}`,
          );
        }

        const alreadyLinked = await tx.bankTransaction.findFirst({
          where: {
            companyId,
            taxObligationId: dto.targetId,
            id: {
              not: dto.bankTransactionId,
            },
          },
        });

        if (alreadyLinked && !dto.force) {
          throw new ConflictException(
            'TaxObligation já vinculada a outra transação bancária.',
          );
        }

        await (tx as any).taxObligation.update({
          where: {
            id: dto.targetId,
          },
          data: {
            status: 'PAID',
            version: {
              increment: 1,
            },
          },
        });
      }

      const updated = await tx.bankTransaction.update({
        where: {
          id: dto.bankTransactionId,
        },
        data: {
          reconciled: true,
          invoiceId: dto.targetType === 'INVOICE' ? dto.targetId : null,
          taxObligationId:
            dto.targetType === 'TAX_OBLIGATION' ? dto.targetId : null,
          metadata: {
            ...(transaction.metadata || {}),
            reconciliation: {
              targetType: dto.targetType,
              targetId: dto.targetId,
              note: dto.note || null,
              reconciledBy: this.getUserId(user),
              reconciledAt: new Date().toISOString(),
              force: dto.force || false,
            },
          },
          version: {
            increment: 1,
          },
        },
        include: {
          bankAccount: true,
          invoice: true,
          taxObligation: true,
        },
      });

      return {
        target,
        updated,
      };
    });

    const financialEvent = await this.createFinancialEventForReconciliation({
      companyId,
      transaction: result.updated,
      targetType: dto.targetType,
      targetId: dto.targetId,
      note: dto.note,
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-reconciliation',
      action: 'BANK_TRANSACTION_RECONCILED',
      entity: 'BankTransaction',
      entityId: dto.bankTransactionId,
      payload: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        transaction: this.normalize(this.enrichTransaction(result.updated)),
        target: this.normalize(result.target),
        financialEvent,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Transação conciliada com sucesso.',
      companyId,
      item: this.normalize(this.enrichTransaction(result.updated)),
      target: this.normalize(result.target),
      financialEvent,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async autoReconcile(
    companyId: string,
    dto: AutoReconciliationEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const limit = Math.min(Math.max(Number(dto.limit || 100), 1), 500);

    const transactions = await this.bankTransactionModel.findMany({
      where: {
        companyId,
        reconciled: false,
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
    });

    const results: Array<Record<string, unknown>> = [];

    for (const transaction of transactions) {
      const candidates = await this.candidatesForTransaction(
        companyId,
        transaction.id,
        dto,
        user,
      );

      const best = (candidates as any).candidates?.[0] as Candidate | undefined;

      if (!best || best.score < 70) {
        results.push({
          transactionId: transaction.id,
          status: 'SKIPPED',
          reason: 'Nenhum candidato com score >= 70.',
          bestScore: best?.score ?? null,
        });
        continue;
      }

      try {
        const matched = await this.manualReconcile(
          companyId,
          {
            bankTransactionId: transaction.id,
            targetType: best.targetType,
            targetId: best.targetId,
            force: false,
            note: `Conciliação automática assistida. Score=${best.score}`,
          },
          user,
        );

        results.push({
          transactionId: transaction.id,
          status: 'MATCHED',
          targetType: best.targetType,
          targetId: best.targetId,
          score: best.score,
          result: matched,
        });
      } catch (error) {
        results.push({
          transactionId: transaction.id,
          status: 'FAILED',
          targetType: best.targetType,
          targetId: best.targetId,
          score: best.score,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-reconciliation',
      action: 'BANK_RECONCILIATION_AUTO_EXECUTED',
      entity: 'BankTransaction',
      entityId: null,
      payload: {
        processed: transactions.length,
        matched: results.filter((item) => item.status === 'MATCHED').length,
        skipped: results.filter((item) => item.status === 'SKIPPED').length,
        failed: results.filter((item) => item.status === 'FAILED').length,
        results,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Conciliação automática assistida finalizada.',
      companyId,
      totals: {
        processed: transactions.length,
        matched: results.filter((item) => item.status === 'MATCHED').length,
        skipped: results.filter((item) => item.status === 'SKIPPED').length,
        failed: results.filter((item) => item.status === 'FAILED').length,
      },
      results,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async undoReconciliation(
    companyId: string,
    transactionId: string,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const transaction = await this.bankTransactionModel.findFirst({
      where: {
        id: transactionId,
        companyId,
      },
      include: {
        invoice: true,
        taxObligation: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transação bancária não encontrada: ${transactionId}`);
    }

    if (!transaction.reconciled) {
      throw new ConflictException('Transação ainda não está conciliada.');
    }

    const previous = this.enrichTransaction(transaction);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (transaction.invoiceId) {
        await tx.invoice.update({
          where: {
            id: transaction.invoiceId,
          },
          data: {
            reconciled: false,
            status: 'NORMAL' as any,
            version: {
              increment: 1,
            },
          },
        });
      }

      if (transaction.taxObligationId) {
        await (tx as any).taxObligation.update({
          where: {
            id: transaction.taxObligationId,
          },
          data: {
            status: 'PENDING',
            version: {
              increment: 1,
            },
          },
        });
      }

      return tx.bankTransaction.update({
        where: {
          id: transactionId,
        },
        data: {
          reconciled: false,
          invoiceId: null,
          taxObligationId: null,
          metadata: {
            ...(transaction.metadata || {}),
            reconciliationUndo: {
              previousInvoiceId: transaction.invoiceId,
              previousTaxObligationId: transaction.taxObligationId,
              undoneBy: this.getUserId(user),
              undoneAt: new Date().toISOString(),
            },
          },
          version: {
            increment: 1,
          },
        },
        include: {
          bankAccount: true,
          invoice: true,
          taxObligation: true,
        },
      });
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'bank-reconciliation',
      action: 'BANK_TRANSACTION_RECONCILIATION_UNDONE',
      entity: 'BankTransaction',
      entityId: transactionId,
      payload: {
        before: this.normalize(previous),
        after: this.normalize(this.enrichTransaction(updated)),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Conciliação desfeita com sucesso.',
      companyId,
      item: this.normalize(this.enrichTransaction(updated)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async summary(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const [accounts, transactions] = await Promise.all([
      this.bankAccountModel.findMany({
        where: {
          companyId,
        },
      }),
      this.bankTransactionModel.findMany({
        where: {
          companyId,
        },
        take: 5000,
      }),
    ]);

    const enrichedAccounts = accounts.map((item: any) => this.enrichAccount(item));
    const enrichedTransactions = transactions.map((item: any) =>
      this.enrichTransaction(item),
    );

    return {
      status: 'OK',
      module: 'banking-enterprise-summary',
      companyId,
      accounts: this.buildAccountSummary(enrichedAccounts),
      transactions: this.buildTransactionSummary(enrichedTransactions),
      generatedAt: new Date().toISOString(),
    };
  }
}
