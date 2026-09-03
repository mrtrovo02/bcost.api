'use strict';

import { Injectable, Logger } from '@nestjs/common';
import {
  ContractStatus,
  InvoiceStatus,
  InvoiceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

type BillingMode = 'MANUAL' | 'MONTHLY_JOB' | 'QUEUE' | 'AUTOMATION';

type BillingOptions = {
  month?: number;
  year?: number;
  mode?: BillingMode;
  force?: boolean;
  triggeredBy?: string;
};

type BillingContractResult = {
  contractId: string;
  customerId: string | null;
  status: 'CREATED' | 'SKIPPED' | 'FAILED';
  invoiceId?: string;
  amount?: number;
  reason?: string;
  error?: string;
};

type BillingResult = {
  status: 'OK' | 'OK_WITH_WARNINGS' | 'FAILED';
  companyId: string;
  period: {
    month: number;
    year: number;
    label: string;
    start: string;
    end: string;
  };
  mode: BillingMode;
  force: boolean;
  totals: {
    contractsFound: number;
    processed: number;
    created: number;
    skipped: number;
    failed: number;
    amountCreated: number;
  };
  items: BillingContractResult[];
  audit: {
    recorded: boolean;
    error?: string;
  };
  generatedAt: string;
};

/**
 * RevenueService
 *
 * Motor de receita/faturamento do bCost.
 *
 * Mantém compatibilidade com:
 * - processBilling(companyId)
 * - processBillingInternal(companyId)
 *
 * Adiciona compatibilidade enterprise com:
 * - processMonthlyBilling(companyId)
 *
 * Esse método é chamado por:
 * - src/modules/revenue/queue/billing.queue.ts
 * - src/modules/automation/automation.service.ts
 *
 * Objetivo:
 * Corrigir falha:
 * this.revenueService.processMonthlyBilling is not a function
 */
@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Endpoint legado:
   * POST /revenue/process-billing/:companyId
   *
   * Mantido para não quebrar frontend, rotas e integrações existentes.
   */
  async processBilling(companyId: string) {
    return this.processBillingInternal(companyId, {
      mode: 'MANUAL',
      force: false,
    });
  }

  /**
   * Método exigido por BillingQueue e AutomationService.
   *
   * Mantém assinatura simples para chamadas existentes:
   * this.revenueService.processMonthlyBilling(companyId)
   */
  async processMonthlyBilling(
    companyId: string,
    options: BillingOptions = {},
  ): Promise<BillingResult> {
    return this.processBillingInternal(companyId, {
      ...options,
      mode: options.mode ?? 'MONTHLY_JOB',
      force: options.force ?? false,
    });
  }

  /**
   * Core de faturamento.
   *
   * Regras enterprise:
   * - Busca contratos ACTIVE da empresa.
   * - Respeita deletedAt quando existir.
   * - Evita duplicidade mensal por contrato/cliente.
   * - Permite force=true para reprocessamento controlado.
   * - Cria Invoice SERVICE NORMAL.
   * - Atualiza lastBillingAt do contrato.
   * - Registra AuditLog em best-effort.
   * - Retorna payload operacional para AutomationJob.result.
   */
  async processBillingInternal(
    companyId: string,
    options: BillingOptions = {},
  ): Promise<BillingResult> {
    const now = new Date();
    const month = Number(options.month || now.getUTCMonth() + 1);
    const year = Number(options.year || now.getUTCFullYear());
    const mode = options.mode ?? 'MANUAL';
    const force = Boolean(options.force);

    const period = this.getMonthPeriod(month, year);

    this.logger.log(
      `[RevenueBilling] Iniciando faturamento: company=${companyId}, period=${period.label}, mode=${mode}, force=${force}`,
    );

    const contracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        status: ContractStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const results: BillingContractResult[] = [];
    let amountCreated = 0;

    for (const contract of contracts) {
      const contractId = String(contract.id);
      const customerId = contract.customerId
        ? String(contract.customerId)
        : null;
      const amount = this.toNumber(contract.amount);

      try {
        if (!customerId) {
          results.push({
            contractId,
            customerId,
            status: 'FAILED',
            amount,
            error: 'Contrato sem customerId.',
          });
          continue;
        }

        if (amount <= 0) {
          results.push({
            contractId,
            customerId,
            status: 'SKIPPED',
            amount,
            reason: 'Contrato com valor zerado ou inválido.',
          });
          continue;
        }

        const billingDay = Number(contract.billingDay || 1);
        const currentDay = now.getUTCDate();

        /**
         * Não bloqueia contratos com billingDay futuro quando mode=MANUAL,
         * mas no job mensal automático evita faturar antes do dia configurado.
         */
        if (
          mode !== 'MANUAL' &&
          !force &&
          Number.isFinite(billingDay) &&
          billingDay >= 1 &&
          billingDay <= 28 &&
          currentDay < billingDay
        ) {
          results.push({
            contractId,
            customerId,
            status: 'SKIPPED',
            amount,
            reason: `Billing day ${billingDay} ainda não chegou.`,
          });
          continue;
        }

        const existing = await this.prisma.invoice.findFirst({
          where: {
            companyId,
            customerId,
            type: InvoiceType.SERVICE,
            deletedAt: null,
            issuedAt: {
              gte: period.start,
              lt: period.end,
            },
          },
          orderBy: {
            issuedAt: 'desc',
          },
        });

        if (existing && !force) {
          results.push({
            contractId,
            customerId,
            status: 'SKIPPED',
            invoiceId: existing.id,
            amount,
            reason:
              'Já existe invoice de serviço para este cliente no período.',
          });
          continue;
        }

        const createdInvoice = await this.prisma.$transaction(async (tx) => {
          const invoice = await tx.invoice.create({
            data: {
              companyId,
              customerId,
              amount: contract.amount,
              type: InvoiceType.SERVICE,
              status: InvoiceStatus.NORMAL,
              issuedAt: now,
              reconciled: false,
            },
          });

          await tx.contract.update({
            where: {
              id: contractId,
            },
            data: {
              lastBillingAt: now,
            },
          });

          return invoice;
        });

        await this.safeAuditLog({
          companyId,
          action: 'AUTO_REVENUE_GENERATION',
          module: 'revenue',
          entity: 'Invoice',
          entityId: createdInvoice.id,
          severity: 'INFO',
          source: mode,
          payload: {
            contractId,
            invoiceId: createdInvoice.id,
            customerId,
            amount,
            period: period.label,
            mode,
            force,
            triggeredBy: options.triggeredBy ?? null,
          },
          statusCode: 201,
        });

        amountCreated += amount;

        results.push({
          contractId,
          customerId,
          status: 'CREATED',
          invoiceId: createdInvoice.id,
          amount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        this.logger.error(
          `❌ [RevenueBilling] Falha no contrato ${contractId}: ${message}`,
        );

        results.push({
          contractId,
          customerId,
          status: 'FAILED',
          amount,
          error: message,
        });
      }
    }

    const created = results.filter((item) => item.status === 'CREATED').length;
    const skipped = results.filter((item) => item.status === 'SKIPPED').length;
    const failed = results.filter((item) => item.status === 'FAILED').length;

    const finalStatus: BillingResult['status'] =
      failed > 0
        ? created > 0 || skipped > 0
          ? 'OK_WITH_WARNINGS'
          : 'FAILED'
        : 'OK';

    const result: BillingResult = {
      status: finalStatus,
      companyId,
      period: {
        month,
        year,
        label: period.label,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      mode,
      force,
      totals: {
        contractsFound: contracts.length,
        processed: results.length,
        created,
        skipped,
        failed,
        amountCreated: Number(amountCreated.toFixed(2)),
      },
      items: results,
      audit: {
        recorded: false,
      },
      generatedAt: new Date().toISOString(),
    };

    const audit = await this.safeAuditLog({
      companyId,
      action: 'REVENUE_MONTHLY_BILLING_PROCESSED',
      module: 'revenue',
      entity: 'BillingCycle',
      entityId: `${companyId}:${period.label}`,
      severity: failed > 0 ? 'WARN' : 'INFO',
      source: mode,
      payload: result as unknown as Record<string, unknown>,
      statusCode: finalStatus === 'FAILED' ? 500 : 200,
    });

    result.audit = audit;

    this.logger.log(
      `[RevenueBilling] Finalizado: company=${companyId}, period=${period.label}, status=${finalStatus}, created=${created}, skipped=${skipped}, failed=${failed}`,
    );

    return result;
  }

  async getRevenueMetrics(companyId: string, month: number, year: number) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const metrics = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: InvoiceStatus.NORMAL,
        deletedAt: null,
        issuedAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const totalInvoiced = metrics._sum.amount?.toNumber() ?? 0;
    const taxProvision = Number((totalInvoiced * 0.155).toFixed(2));
    const factorR = await this.getFactorR(companyId);

    return {
      period: `${String(month).padStart(2, '0')}/${year}`,
      totalInvoiced,
      taxProvision,
      invoiceCount: metrics._count.id,
      fiscalIntelligence: {
        isEligibleAnexoIII: factorR.isEligibleForAnexoIII,
      },
    };
  }

  async getRevenueStats(companyId: string) {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();
    const currentPeriod = this.getMonthPeriod(currentMonth, currentYear);
    const previousPeriodDate = new Date(
      Date.UTC(currentYear, currentMonth - 2, 1),
    );
    const previousPeriod = this.getMonthPeriod(
      previousPeriodDate.getUTCMonth() + 1,
      previousPeriodDate.getUTCFullYear(),
    );
    const yearStart = new Date(Date.UTC(currentYear, 0, 1));
    const nextYearStart = new Date(Date.UTC(currentYear + 1, 0, 1));

    const [yearRevenue, currentRevenue, previousRevenue, activeContracts] =
      await this.prisma.withRlsCompanyContext(companyId, async (tx) =>
        Promise.all([
          tx.invoice.aggregate({
            where: {
              companyId,
              status: InvoiceStatus.NORMAL,
              deletedAt: null,
              issuedAt: {
                gte: yearStart,
                lt: nextYearStart,
              },
            },
            _sum: { amount: true },
          }),
          tx.invoice.aggregate({
            where: {
              companyId,
              status: InvoiceStatus.NORMAL,
              deletedAt: null,
              issuedAt: {
                gte: currentPeriod.start,
                lt: currentPeriod.end,
              },
            },
            _sum: { amount: true },
          }),
          tx.invoice.aggregate({
            where: {
              companyId,
              status: InvoiceStatus.NORMAL,
              deletedAt: null,
              issuedAt: {
                gte: previousPeriod.start,
                lt: previousPeriod.end,
              },
            },
            _sum: { amount: true },
          }),
          tx.contract.aggregate({
            where: {
              companyId,
              status: ContractStatus.ACTIVE,
              deletedAt: null,
            },
            _count: { id: true },
            _sum: { amount: true },
          }),
        ]),
      );

    const totalRevenue = this.toNumber(yearRevenue._sum.amount);
    const currentMonthRevenue = this.toNumber(currentRevenue._sum.amount);
    const previousMonthRevenue = this.toNumber(previousRevenue._sum.amount);
    const monthlyRecurringRevenue = this.toNumber(activeContracts._sum.amount);
    const growthRate =
      previousMonthRevenue > 0
        ? Number(
            (
              ((currentMonthRevenue - previousMonthRevenue) /
                previousMonthRevenue) *
              100
            ).toFixed(2),
          )
        : currentMonthRevenue > 0
          ? 100
          : 0;

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      projectedRevenue: Number((monthlyRecurringRevenue * 12).toFixed(2)),
      growthRate,
      activeContracts: activeContracts._count.id,
      period: {
        year: currentYear,
        currentMonth,
        current: currentPeriod.label,
        previous: previousPeriod.label,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getRevenueContracts(companyId: string) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) =>
      tx.contract.findMany({
        where: {
          companyId,
          deletedAt: null,
        },
        include: {
          customer: true,
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async getFactorR(companyId: string) {
    const now = new Date();
    const startDate = new Date(
      Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1),
    );

    const [revenueAgg, payrollAgg] = await this.prisma.withRlsCompanyContext(
      companyId,
      async (tx) =>
        Promise.all([
          tx.invoice.aggregate({
            where: {
              companyId,
              status: InvoiceStatus.NORMAL,
              deletedAt: null,
              issuedAt: { gte: startDate },
            },
            _sum: { amount: true },
          }),
          tx.payroll.aggregate({
            where: {
              companyId,
            },
            _sum: { totalAmount: true },
          }),
        ]),
    );

    const revenueLast12Months = revenueAgg._sum.amount?.toNumber() ?? 0;
    const payrollLast12Months = payrollAgg._sum.totalAmount?.toNumber() ?? 0;

    const value =
      payrollLast12Months > 0 && revenueLast12Months === 0
        ? 0.28
        : payrollLast12Months === 0
          ? 0.01
          : Number((payrollLast12Months / revenueLast12Months).toFixed(4));

    const isEligibleForAnexoIII = value >= 0.28;

    return {
      value,
      isEligibleForAnexoIII,
      revenueLast12Months,
      payrollLast12Months,
      analysis: isEligibleForAnexoIII
        ? 'Elegível ao Anexo III. Fator R igual ou superior a 28%.'
        : 'Sujeito ao Anexo V. Fator R abaixo de 28%. Alíquota majorada (mín. 15.5%).',
    };
  }

  private getMonthPeriod(month: number, year: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('month deve estar entre 1 e 12.');
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error('year inválido.');
    }

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const label = `${year}-${String(month).padStart(2, '0')}`;

    return {
      start,
      end,
      label,
    };
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * AuditLog best-effort.
   *
   * O schema em produção já demonstrou que AuditLog pode exigir relation connect.
   * Por isso tentamos múltiplos formatos sem quebrar o faturamento.
   */
  private async safeAuditLog(params: {
    companyId: string;
    module: string;
    action: string;
    entity: string;
    entityId?: string | null;
    severity?: string;
    source?: string;
    payload?: Record<string, unknown>;
    statusCode?: number | null;
  }): Promise<{ recorded: boolean; error?: string }> {
    const payload = this.toJsonObject({
      ...(params.payload ?? {}),
      severity: params.severity ?? 'INFO',
      source: params.source ?? params.module,
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    });

    const baseData = {
      module: params.module,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      statusCode: params.statusCode ?? null,
      responseTime: null,
      ipAddress: null,
      userAgent: null,
      payload,
    };

    const candidates: Prisma.AuditLogUncheckedCreateInput[] = [
      {
        companyId: params.companyId,
        ...baseData,
      },
      {
        companyId: params.companyId,
        module: params.module,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        payload,
      },
    ];

    const errors: string[] = [];

    for (const data of candidates) {
      try {
        await this.prisma.auditLog.create({ data });

        return {
          recorded: true,
        };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const lastError = errors[errors.length - 1] || 'Falha desconhecida.';

    this.logger.warn(`[RevenueBilling] AuditLog skipped: ${lastError}`);

    return {
      recorded: false,
      error: lastError,
    };
  }
}
