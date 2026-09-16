'use strict';

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { FinanceOperationsQueryDto } from './dto/finance-operations-query.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type FinanceStatus =
  | 'PAID'
  | 'RECEIVED'
  | 'OPEN'
  | 'PENDING'
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'CANCELLED'
  | 'UNKNOWN';

type FinanceItemType = 'RECEIVABLE' | 'PAYABLE' | 'CASH_IN' | 'CASH_OUT';

type FinanceItem = {
  id: string;
  type: FinanceItemType;
  source: string;
  title: string;
  description: string | null;
  amount: number;
  status: FinanceStatus;
  dueDate: string | null;
  occurredAt: string | null;
  customerName?: string | null;
  document?: string | null;
  daysOverdue: number;
  daysToDue: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  raw?: unknown;
};

type FinancePrismaModelKey =
  | 'company'
  | 'invoice'
  | 'taxObligation'
  | 'fiscalObligation'
  | 'bankTransaction'
  | 'bankAccount'
  | 'financialEvent'
  | 'financialSnapshot'
  | 'cashFlowProjection'
  | 'customer'
  | 'contract';

type FinanceSourceRecord = Record<string, unknown> & {
  id?: unknown;
  customer?: Record<string, unknown> | null;
  bankAccount?: Record<string, unknown> | null;
};

type FinanceReadableModel = {
  findMany?: (args?: unknown) => Promise<unknown[]>;
  findFirst?: (args?: unknown) => Promise<unknown | null>;
  findUnique?: (args?: unknown) => Promise<unknown | null>;
  count?: (args?: unknown) => Promise<number>;
};

type FinanceFindFirstModel = FinanceReadableModel & {
  findFirst: (args?: unknown) => Promise<unknown | null>;
};

type DecimalLike = {
  toNumber: () => number;
};

@Injectable()
export class FinanceOperationsEnterpriseService {
  private readonly logger = new Logger(FinanceOperationsEnterpriseService.name);

  private readonly summaryCache = new Map<
    string,
    {
      expiresAt: number;
      payload: Record<string, unknown>;
    }
  >();

  private readonly SUMMARY_CACHE_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private buildSummaryCacheKey(
    companyId: string,
    query: FinanceOperationsQueryDto,
  ) {
    return [
      'finance-operations-summary',
      companyId,
      `limit=${query.limit ?? 100}`,
      `from=${query.from || ''}`,
      `to=${query.to || ''}`,
      `status=${query.status || ''}`,
      `source=${query.source || ''}`,
      `includeRaw=${query.includeRaw || 'false'}`,
    ].join('|');
  }

  private getSummaryCache(key: string) {
    const cached = this.summaryCache.get(key);

    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.summaryCache.delete(key);
      return null;
    }

    return cached.payload;
  }

  private setSummaryCache(key: string, payload: Record<string, unknown>) {
    if (this.summaryCache.size > 100) {
      const firstKey = this.summaryCache.keys().next().value;

      if (firstKey) {
        this.summaryCache.delete(firstKey);
      }
    }

    this.summaryCache.set(key, {
      expiresAt: Date.now() + this.SUMMARY_CACHE_TTL_MS,
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

  private isReadableModel(value: unknown): value is FinanceReadableModel {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as FinanceReadableModel;

    return Boolean(
      candidate.findMany || candidate.findFirst || candidate.count,
    );
  }

  private isSourceRecord(value: unknown): value is FinanceSourceRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private isDecimalLike(value: unknown): value is DecimalLike {
    if (!value || typeof value !== 'object' || !('toNumber' in value)) {
      return false;
    }

    return typeof (value as DecimalLike).toNumber === 'function';
  }

  private hasFindFirst(
    value: FinanceReadableModel | null,
  ): value is FinanceFindFirstModel {
    return Boolean(value?.findFirst);
  }

  private getModel(
    prismaKey: FinancePrismaModelKey,
  ): FinanceReadableModel | null {
    const model = this.prisma[prismaKey] as unknown;

    return this.isReadableModel(model) ? model : null;
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

  private toNumber(value: unknown): number {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (this.isDecimalLike(value)) {
      try {
        return Number(value.toNumber());
      } catch {
        return 0;
      }
    }

    return 0;
  }

  private toText(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    if (value instanceof Date) return value.toISOString();
    if (value instanceof Prisma.Decimal) return value.toString();

    return null;
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    try {
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  private iso(value: unknown): string | null {
    const date = this.toDate(value);
    return date ? date.toISOString() : null;
  }

  private nowStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private daysBetween(from: Date, to: Date) {
    const dayMs = 24 * 60 * 60 * 1000;
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());

    return Math.floor((b.getTime() - a.getTime()) / dayMs);
  }

  private classifyStatus(
    rawStatus: unknown,
    dueDate: unknown,
    paidSignals: unknown[] = [],
  ): FinanceStatus {
    const status = String(rawStatus || '').toUpperCase();
    const due = this.toDate(dueDate);
    const today = this.nowStart();

    const paid = paidSignals.some((signal) => {
      if (typeof signal === 'boolean') return signal;
      const normalized = String(signal || '').toUpperCase();

      return [
        'PAID',
        'PAYED',
        'RECEIVED',
        'RECONCILED',
        'SETTLED',
        'DONE',
        'COMPLETED',
        'CLOSED',
      ].includes(normalized);
    });

    if (paid) {
      return status.includes('RECEIV') ? 'RECEIVED' : 'PAID';
    }

    if (
      status.includes('CANCEL') ||
      status.includes('VOID') ||
      status.includes('REJECT')
    ) {
      return 'CANCELLED';
    }

    if (
      status.includes('PAID') ||
      status.includes('PAYED') ||
      status.includes('RECEIVED') ||
      status.includes('SETTLED') ||
      status.includes('DONE') ||
      status.includes('COMPLETED')
    ) {
      return 'PAID';
    }

    if (due && due < today) return 'OVERDUE';

    if (due) {
      const daysToDue = this.daysBetween(today, due);

      if (daysToDue <= 7) return 'DUE_SOON';
    }

    if (status.includes('OPEN')) return 'OPEN';
    if (status.includes('PENDING')) return 'PENDING';

    return due ? 'OPEN' : 'UNKNOWN';
  }

  private riskLevel(
    status: FinanceStatus,
    amount: number,
    daysOverdue: number,
  ) {
    if (status === 'OVERDUE' && daysOverdue >= 30) return 'CRITICAL';
    if (status === 'OVERDUE') return amount >= 10000 ? 'CRITICAL' : 'HIGH';
    if (status === 'DUE_SOON') return amount >= 10000 ? 'HIGH' : 'MEDIUM';
    if (amount >= 50000) return 'MEDIUM';

    return 'LOW';
  }

  private applyDateFilter<T extends FinanceItem>(
    items: T[],
    query: FinanceOperationsQueryDto,
  ): T[] {
    const from = this.toDate(query.from);
    const to = this.toDate(query.to);

    return items.filter((item) => {
      const date = this.toDate(item.dueDate || item.occurredAt);

      if (!date) return true;
      if (from && date < from) return false;
      if (to && date > to) return false;

      return true;
    });
  }

  private applyStatusFilter<T extends FinanceItem>(
    items: T[],
    query: FinanceOperationsQueryDto,
  ): T[] {
    if (!query.status) return items;

    const wanted = query.status.toUpperCase();

    return items.filter((item) => item.status === wanted);
  }

  private sortItems<T extends FinanceItem>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      const aDate = this.toDate(a.dueDate || a.occurredAt)?.getTime() || 0;
      const bDate = this.toDate(b.dueDate || b.occurredAt)?.getTime() || 0;

      return aDate - bDate;
    });
  }

  private limit(query: FinanceOperationsQueryDto) {
    return Math.min(Math.max(Number(query.limit || 100), 1), 1000);
  }

  private async ensureCompany(companyId: string) {
    const companyModel = this.getModel('company');

    if (!this.hasFindFirst(companyModel)) {
      throw new NotFoundException('Modelo Prisma company não encontrado.');
    }

    const company = await companyModel.findFirst({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException(`Empresa não encontrada: ${companyId}`);
    }

    return this.normalize(company);
  }

  private async fetchSafe(
    prismaKey: FinancePrismaModelKey,
    companyId: string,
    take = 1000,
  ): Promise<FinanceSourceRecord[]> {
    const model = this.getModel(prismaKey);

    if (!model?.findMany) return [];

    const variants = [
      {
        where: { companyId },
        take,
      },
      {
        where: { companyId },
      },
      {
        take,
      },
      {},
    ];

    for (const args of variants) {
      try {
        const rows = await model.findMany(args);
        return rows.filter((item) => this.isSourceRecord(item));
      } catch (error) {
        this.logger.warn(
          `[FinanceOperationsEnterprise] Falha ao buscar ${prismaKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return [];
  }

  private invoiceToReceivable(
    invoice: FinanceSourceRecord,
    includeRaw: boolean,
  ): FinanceItem {
    const amount = this.toNumber(
      invoice.amount ?? invoice.totalAmount ?? invoice.value,
    );
    const dueDate =
      invoice.dueDate ??
      invoice.paymentDueDate ??
      invoice.issuedAt ??
      invoice.createdAt ??
      null;

    const status = this.classifyStatus(
      invoice.status ?? invoice.nfeStatus,
      dueDate,
      [
        invoice.paid,
        invoice.received,
        invoice.reconciled,
        invoice.bankTransactionId ? 'RECEIVED' : null,
      ],
    );

    const due = this.toDate(dueDate);
    const today = this.nowStart();
    const daysToDue = due ? this.daysBetween(today, due) : null;
    const daysOverdue =
      due && due < today ? Math.abs(this.daysBetween(today, due)) : 0;

    return {
      id: String(invoice.id),
      type: 'RECEIVABLE',
      source: 'invoice',
      title: `Nota fiscal ${
        this.toText(invoice.number) ||
        this.toText(invoice.accessKey) ||
        this.toText(invoice.id) ||
        'sem identificador'
      }`,
      description:
        this.toText(invoice.description) ||
        this.toText(invoice.serviceDescription),
      amount,
      status: status === 'PAID' ? 'RECEIVED' : status,
      dueDate: this.iso(dueDate),
      occurredAt: this.iso(invoice.issuedAt ?? invoice.createdAt),
      customerName:
        invoice.customer?.name?.toString() ||
        invoice.customerName?.toString() ||
        null,
      document:
        invoice.customer?.document?.toString() ||
        invoice.document?.toString() ||
        null,
      daysOverdue,
      daysToDue,
      riskLevel: this.riskLevel(status, amount, daysOverdue),
      raw: includeRaw ? this.normalize(invoice) : undefined,
    };
  }

  private taxObligationToPayable(
    obligation: FinanceSourceRecord,
    includeRaw: boolean,
  ): FinanceItem {
    const amount = this.toNumber(
      obligation.amount ?? obligation.value ?? obligation.total,
    );
    const dueDate = obligation.dueDate ?? obligation.createdAt ?? null;

    const status = this.classifyStatus(obligation.status, dueDate, [
      obligation.paid,
      obligation.bankTransactionId ? 'PAID' : null,
    ]);

    const due = this.toDate(dueDate);
    const today = this.nowStart();
    const daysToDue = due ? this.daysBetween(today, due) : null;
    const daysOverdue =
      due && due < today ? Math.abs(this.daysBetween(today, due)) : 0;

    return {
      id: String(obligation.id),
      type: 'PAYABLE',
      source: 'tax-obligation',
      title:
        this.toText(obligation.name) ||
        this.toText(obligation.description) ||
        `Obrigação tributária ${
          this.toText(obligation.id) || 'sem identificador'
        }`,
      description:
        this.toText(obligation.type) || this.toText(obligation.period),
      amount,
      status,
      dueDate: this.iso(dueDate),
      occurredAt: this.iso(obligation.createdAt),
      daysOverdue,
      daysToDue,
      riskLevel: this.riskLevel(status, amount, daysOverdue),
      raw: includeRaw ? this.normalize(obligation) : undefined,
    };
  }

  private fiscalObligationToPayable(
    obligation: FinanceSourceRecord,
    includeRaw: boolean,
  ): FinanceItem {
    const amount = this.toNumber(
      obligation.amount ??
        obligation.value ??
        obligation.totalAmount ??
        obligation.taxAmount ??
        0,
    );

    const dueDate = obligation.dueDate ?? obligation.createdAt ?? null;

    const status = this.classifyStatus(obligation.status, dueDate, [
      obligation.submittedAt ? 'DONE' : null,
      obligation.paid,
    ]);

    const due = this.toDate(dueDate);
    const today = this.nowStart();
    const daysToDue = due ? this.daysBetween(today, due) : null;
    const daysOverdue =
      due && due < today ? Math.abs(this.daysBetween(today, due)) : 0;

    return {
      id: String(obligation.id),
      type: 'PAYABLE',
      source: 'fiscal-obligation',
      title:
        this.toText(obligation.name) ||
        this.toText(obligation.type) ||
        this.toText(obligation.obligationType) ||
        `Obrigação fiscal ${this.toText(obligation.id) || 'sem identificador'}`,
      description:
        this.toText(obligation.receiptNumber) ||
        this.toText(obligation.protocol),
      amount,
      status,
      dueDate: this.iso(dueDate),
      occurredAt: this.iso(obligation.createdAt),
      daysOverdue,
      daysToDue,
      riskLevel: this.riskLevel(status, amount, daysOverdue),
      raw: includeRaw ? this.normalize(obligation) : undefined,
    };
  }

  private bankTransactionToCashItem(
    transaction: FinanceSourceRecord,
    includeRaw: boolean,
  ): FinanceItem {
    const amount = this.toNumber(transaction.amount ?? transaction.value);
    const typeText = String(transaction.type || '').toUpperCase();
    const type: FinanceItemType =
      amount < 0 || typeText.includes('DEBIT') || typeText.includes('OUT')
        ? 'CASH_OUT'
        : 'CASH_IN';

    const occurredAt =
      transaction.date ??
      transaction.transactionDate ??
      transaction.occurredAt ??
      transaction.createdAt;

    return {
      id: String(transaction.id),
      type,
      source: 'bank-transaction',
      title:
        this.toText(transaction.description) ||
        this.toText(transaction.memo) ||
        this.toText(transaction.reference) ||
        `Transação bancária ${
          this.toText(transaction.id) || 'sem identificador'
        }`,
      description:
        this.toText(transaction.bankAccount?.name) ||
        this.toText(transaction.bankAccountId),
      amount: Math.abs(amount),
      status: transaction.reconciled ? 'PAID' : 'OPEN',
      dueDate: null,
      occurredAt: this.iso(occurredAt),
      daysOverdue: 0,
      daysToDue: null,
      riskLevel: transaction.reconciled ? 'LOW' : 'MEDIUM',
      raw: includeRaw ? this.normalize(transaction) : undefined,
    };
  }

  private summarizeItems(items: FinanceItem[]) {
    const totalAmount = items.reduce(
      (sum, item) => sum + Math.abs(item.amount),
      0,
    );
    const overdue = items.filter((item) => item.status === 'OVERDUE');
    const dueSoon = items.filter((item) => item.status === 'DUE_SOON');
    const open = items.filter((item) =>
      ['OPEN', 'PENDING', 'OVERDUE', 'DUE_SOON', 'UNKNOWN'].includes(
        item.status,
      ),
    );
    const settled = items.filter((item) =>
      ['PAID', 'RECEIVED'].includes(item.status),
    );

    return {
      count: items.length,
      totalAmount,
      openAmount: open.reduce((sum, item) => sum + Math.abs(item.amount), 0),
      overdueAmount: overdue.reduce(
        (sum, item) => sum + Math.abs(item.amount),
        0,
      ),
      dueSoonAmount: dueSoon.reduce(
        (sum, item) => sum + Math.abs(item.amount),
        0,
      ),
      settledAmount: settled.reduce(
        (sum, item) => sum + Math.abs(item.amount),
        0,
      ),
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      openCount: open.length,
      settledCount: settled.length,
    };
  }

  private agingBuckets(items: FinanceItem[]) {
    const buckets = {
      current: { count: 0, amount: 0 },
      dueSoon7: { count: 0, amount: 0 },
      overdue1To7: { count: 0, amount: 0 },
      overdue8To30: { count: 0, amount: 0 },
      overdue31To60: { count: 0, amount: 0 },
      overdue61Plus: { count: 0, amount: 0 },
    };

    for (const item of items) {
      const amount = Math.abs(item.amount);

      if (item.status === 'DUE_SOON') {
        buckets.dueSoon7.count += 1;
        buckets.dueSoon7.amount += amount;
        continue;
      }

      if (item.status !== 'OVERDUE') {
        buckets.current.count += 1;
        buckets.current.amount += amount;
        continue;
      }

      if (item.daysOverdue <= 7) {
        buckets.overdue1To7.count += 1;
        buckets.overdue1To7.amount += amount;
      } else if (item.daysOverdue <= 30) {
        buckets.overdue8To30.count += 1;
        buckets.overdue8To30.amount += amount;
      } else if (item.daysOverdue <= 60) {
        buckets.overdue31To60.count += 1;
        buckets.overdue31To60.amount += amount;
      } else {
        buckets.overdue61Plus.count += 1;
        buckets.overdue61Plus.amount += amount;
      }
    }

    return buckets;
  }

  private cashflowProjection(
    receivables: FinanceItem[],
    payables: FinanceItem[],
    cashItems: FinanceItem[],
  ) {
    const cashIn = cashItems
      .filter((item) => item.type === 'CASH_IN')
      .reduce((sum, item) => sum + item.amount, 0);

    const cashOut = cashItems
      .filter((item) => item.type === 'CASH_OUT')
      .reduce((sum, item) => sum + item.amount, 0);

    const receivableOpen = receivables
      .filter((item) => !['RECEIVED', 'CANCELLED'].includes(item.status))
      .reduce((sum, item) => sum + item.amount, 0);

    const payableOpen = payables
      .filter((item) => !['PAID', 'CANCELLED'].includes(item.status))
      .reduce((sum, item) => sum + item.amount, 0);

    const netCash = cashIn - cashOut;
    const projectedNet = netCash + receivableOpen - payableOpen;

    const riskStatus =
      projectedNet < 0
        ? 'CRITICAL'
        : payableOpen > receivableOpen * 1.2
          ? 'ATTENTION'
          : 'HEALTHY';

    return {
      cashIn,
      cashOut,
      netCash,
      receivableOpen,
      payableOpen,
      projectedNet,
      riskStatus,
    };
  }

  private async loadFinanceDataset(
    companyId: string,
    query: FinanceOperationsQueryDto,
  ) {
    const limit = this.limit(query);
    const includeRaw = query.includeRaw === 'true';

    const [
      invoices,
      taxObligations,
      fiscalObligations,
      bankTransactions,
      bankAccounts,
      financialEvents,
      financialSnapshots,
      cashFlowProjections,
      customers,
      contracts,
    ] = await Promise.all([
      this.fetchSafe('invoice', companyId, limit),
      this.fetchSafe('taxObligation', companyId, limit),
      this.fetchSafe('fiscalObligation', companyId, limit),
      this.fetchSafe('bankTransaction', companyId, limit),
      this.fetchSafe('bankAccount', companyId, limit),
      this.fetchSafe('financialEvent', companyId, limit),
      this.fetchSafe('financialSnapshot', companyId, limit),
      this.fetchSafe('cashFlowProjection', companyId, limit),
      this.fetchSafe('customer', companyId, limit),
      this.fetchSafe('contract', companyId, limit),
    ]);

    const receivables = this.sortItems(
      this.applyStatusFilter(
        this.applyDateFilter(
          invoices.map((invoice) =>
            this.invoiceToReceivable(invoice, includeRaw),
          ),
          query,
        ),
        query,
      ),
    );

    const payables = this.sortItems(
      this.applyStatusFilter(
        this.applyDateFilter(
          [
            ...taxObligations.map((item) =>
              this.taxObligationToPayable(item, includeRaw),
            ),
            ...fiscalObligations.map((item) =>
              this.fiscalObligationToPayable(item, includeRaw),
            ),
          ],
          query,
        ),
        query,
      ),
    );

    const cashItems = this.sortItems(
      this.applyDateFilter(
        bankTransactions.map((item) =>
          this.bankTransactionToCashItem(item, includeRaw),
        ),
        query,
      ),
    );

    return {
      receivables,
      payables,
      cashItems,
      bankAccounts: this.normalize(bankAccounts),
      financialEvents: this.normalize(financialEvents),
      financialSnapshots: this.normalize(financialSnapshots),
      cashFlowProjections: this.normalize(cashFlowProjections),
      customers: this.normalize(customers),
      contracts: this.normalize(contracts),
      sourceCounts: {
        invoices: invoices.length,
        taxObligations: taxObligations.length,
        fiscalObligations: fiscalObligations.length,
        bankTransactions: bankTransactions.length,
        bankAccounts: bankAccounts.length,
        financialEvents: financialEvents.length,
        financialSnapshots: financialSnapshots.length,
        cashFlowProjections: cashFlowProjections.length,
        customers: customers.length,
        contracts: contracts.length,
      },
    };
  }

  async summary(
    companyId: string,
    query: FinanceOperationsQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const cacheKey = this.buildSummaryCacheKey(companyId, query);
    const cached = this.getSummaryCache(cacheKey);

    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          ttlMs: this.SUMMARY_CACHE_TTL_MS,
          key: cacheKey,
        },
      };
    }

    const startedAt = Date.now();

    const company = await this.ensureCompany(companyId);
    const dataset = await this.loadFinanceDataset(companyId, query);

    const receivablesSummary = this.summarizeItems(dataset.receivables);
    const payablesSummary = this.summarizeItems(dataset.payables);
    const cashflow = this.cashflowProjection(
      dataset.receivables,
      dataset.payables,
      dataset.cashItems,
    );

    const financeScore = Math.max(
      0,
      Math.min(
        100,
        100 -
          receivablesSummary.overdueCount * 4 -
          payablesSummary.overdueCount * 5 -
          (cashflow.riskStatus === 'CRITICAL' ? 20 : 0) -
          (cashflow.riskStatus === 'ATTENTION' ? 8 : 0),
      ),
    );

    const financeStatus =
      financeScore < 60 || cashflow.riskStatus === 'CRITICAL'
        ? 'CRITICAL'
        : financeScore < 85 || cashflow.riskStatus === 'ATTENTION'
          ? 'ATTENTION'
          : 'HEALTHY';

    const response = {
      status: 'OK',
      module: 'finance-operations-enterprise',
      companyId,
      company,
      requestedBy: {
        userId: this.getUserId(user),
        email: user?.email || null,
        role: user?.role || null,
      },
      executiveSummary: {
        financeScore,
        financeStatus,
        receivables: receivablesSummary,
        payables: payablesSummary,
        cashflow,
        totalOpenAmount:
          receivablesSummary.openAmount + payablesSummary.openAmount,
        totalOverdueAmount:
          receivablesSummary.overdueAmount + payablesSummary.overdueAmount,
        totalOverdueCount:
          receivablesSummary.overdueCount + payablesSummary.overdueCount,
      },
      aging: {
        receivables: this.agingBuckets(dataset.receivables),
        payables: this.agingBuckets(dataset.payables),
      },
      lists: {
        receivables: dataset.receivables.slice(0, this.limit(query)),
        payables: dataset.payables.slice(0, this.limit(query)),
        cashItems: dataset.cashItems.slice(0, this.limit(query)),
      },
      supportingData: {
        sourceCounts: dataset.sourceCounts,
        bankAccounts: dataset.bankAccounts,
        financialSnapshots: dataset.financialSnapshots,
        cashFlowProjections: dataset.cashFlowProjections,
      },
      cache: {
        hit: false,
        ttlMs: this.SUMMARY_CACHE_TTL_MS,
        key: cacheKey,
      },
      performance: {
        computedInMs: Date.now() - startedAt,
      },
      generatedAt: new Date().toISOString(),
    };

    this.setSummaryCache(cacheKey, response);

    return response;
  }

  async receivables(
    companyId: string,
    query: FinanceOperationsQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    await this.ensureCompany(companyId);

    const dataset = await this.loadFinanceDataset(companyId, query);

    return {
      status: 'OK',
      module: 'finance-operations-receivables',
      companyId,
      summary: this.summarizeItems(dataset.receivables),
      aging: this.agingBuckets(dataset.receivables),
      items: dataset.receivables.slice(0, this.limit(query)),
      generatedAt: new Date().toISOString(),
    };
  }

  async payables(
    companyId: string,
    query: FinanceOperationsQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    await this.ensureCompany(companyId);

    const dataset = await this.loadFinanceDataset(companyId, query);

    return {
      status: 'OK',
      module: 'finance-operations-payables',
      companyId,
      summary: this.summarizeItems(dataset.payables),
      aging: this.agingBuckets(dataset.payables),
      items: dataset.payables.slice(0, this.limit(query)),
      generatedAt: new Date().toISOString(),
    };
  }

  async cashflow(
    companyId: string,
    query: FinanceOperationsQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    await this.ensureCompany(companyId);

    const dataset = await this.loadFinanceDataset(companyId, query);

    return {
      status: 'OK',
      module: 'finance-operations-cashflow',
      companyId,
      cashflow: this.cashflowProjection(
        dataset.receivables,
        dataset.payables,
        dataset.cashItems,
      ),
      cashItems: dataset.cashItems.slice(0, this.limit(query)),
      cashFlowProjections: dataset.cashFlowProjections,
      generatedAt: new Date().toISOString(),
    };
  }

  async aging(
    companyId: string,
    query: FinanceOperationsQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    await this.ensureCompany(companyId);

    const dataset = await this.loadFinanceDataset(companyId, query);

    return {
      status: 'OK',
      module: 'finance-operations-aging',
      companyId,
      aging: {
        receivables: this.agingBuckets(dataset.receivables),
        payables: this.agingBuckets(dataset.payables),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async timeline(
    companyId: string,
    query: FinanceOperationsQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    await this.ensureCompany(companyId);

    const dataset = await this.loadFinanceDataset(companyId, query);
    const items = [
      ...dataset.receivables,
      ...dataset.payables,
      ...dataset.cashItems,
    ];

    return {
      status: 'OK',
      module: 'finance-operations-timeline',
      companyId,
      items: this.sortItems(items).slice(0, this.limit(query)),
      financialEvents: dataset.financialEvents,
      generatedAt: new Date().toISOString(),
    };
  }
}
