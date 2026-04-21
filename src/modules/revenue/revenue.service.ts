'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  InvoiceType,
  InvoiceStatus,
  ContractStatus,
  Invoice,
  Contract,
  JobStatus,
  TransactionType,
} from '@prisma/client';
import { CalculateFactorRUseCase } from './use-cases/calculate-factor-r.use-case.js';
import { CloseMonthUseCase } from './use-cases/close-month.use-case.js';

/**
 * RevenueService: Orquestrador robusto de Ciclo de Receita.
 * Gerencia faturamento automático, fechamento de governança e métricas fiscais.
 * Desenvolvido para superar as funcionalidades de grandes ERPs (ContaAzul, Omie).
 */
@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);
  // UUID padrão para processos de sistema (satisfaz FK de audit_logs)
  private readonly SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    // Injeção direta por tipo - remove o erro UnknownDependenciesException [0]
    private readonly prisma: PrismaService,
    private readonly calculateFactorRUseCase: CalculateFactorRUseCase,
    private readonly closeMonthUseCase: CloseMonthUseCase,
  ) {}

  /**
   * EXECUÇÃO DE FATURAMENTO EM MASSA
   * Varre contratos ativos, gera faturas e registra o progresso em tempo real.
   * Ajustado: Check de Certificado Digital (campo validTo).
   */
  async processMonthlyBilling(companyId: string) {
    this.logger.log(`🎬 Iniciando ciclo de faturamento: ${companyId}`);

    // --- GUARDRAIL DE CERTIFICADO ---
    const certificate = await this.prisma.digitalCertificate.findFirst({
      where: { companyId, status: 'ACTIVE' },
    });

    if (!certificate || certificate.validTo < new Date()) {
      this.logger.error(
        `🚨 Bloqueio de Faturamento: Certificado A1 ausente ou expirado para ${companyId}`,
      );
      return { error: 'CERTIFICATE_EXPIRED_OR_MISSING' };
    }
    // --------------------------------

    const today = new Date();
    const firstDayOfCurrentMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    );

    const job = await this.prisma.automationJob.create({
      data: {
        companyId,
        name: 'DAILY_BILLING_ENGINE',
        type: 'BILLING',
        status: JobStatus.QUEUED,
        payload: {
          billingDay: today.getDate(),
          referenceDate: today.toISOString(),
        },
        progress: 0,
      },
    });

    try {
      const pendingContracts = await this.prisma.contract.findMany({
        where: {
          companyId,
          status: ContractStatus.ACTIVE,
          billingDay: today.getDate(),
          OR: [
            { lastBillingAt: null },
            { lastBillingAt: { lt: firstDayOfCurrentMonth } },
          ],
        },
      });

      if (pendingContracts.length === 0) {
        await this.prisma.automationJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            progress: 100,
            result: { message: 'No contracts to bill today' },
          },
        });
        return { processed: 0 };
      }

      await this.prisma.automationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING, startedAt: new Date() },
      });

      const results: Invoice[] = [];
      let processedCount = 0;

      for (const contract of pendingContracts) {
        try {
          const invoice = await this.createInvoiceFromContract(contract);
          if (invoice) results.push(invoice);

          processedCount++;
          const progress = Math.round(
            (processedCount / pendingContracts.length) * 100,
          );
          await this.prisma.automationJob.update({
            where: { id: job.id },
            data: { progress },
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`❌ Falha no contrato ${contract.id}: ${message}`);
        }
      }

      await this.prisma.automationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          result: { invoicesGenerated: results.length },
        },
      });

      return { processed: results.length };
    } catch (criticalError: unknown) {
      const message =
        criticalError instanceof Error
          ? criticalError.message
          : String(criticalError);
      await this.prisma.automationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          result: { error: message },
        },
      });
      throw criticalError;
    }
  }

  /**
   * FECHAMENTO DE GOVERNANÇA (SNAPSHOT)
   * Sela o mês financeiro e gera o Hash de Integridade para auditoria.
   */
  async closeFinancialMonth(companyId: string, month: number, year: number) {
    this.logger.log(
      `🛡️ Iniciando fechamento de governança para ${companyId} [${month}/${year}]`,
    );

    const job = await this.prisma.automationJob.create({
      data: {
        companyId,
        name: 'FINANCIAL_CLOSE_SNAPSHOT',
        type: 'COMPLIANCE',
        status: JobStatus.RUNNING,
        payload: { month, year },
        progress: 0,
      },
    });

    try {
      const snapshot = await this.closeMonthUseCase.execute(
        companyId,
        month,
        year,
      );

      await this.prisma.automationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          result: { snapshotId: snapshot.id, hash: snapshot.integrityHash },
        },
      });

      return snapshot;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.automationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, result: { error: message } },
      });
      throw error;
    }
  }

  /**
   * CONCILIAÇÃO INTELIGENTE
   * Tenta bater transações bancárias com faturas emitidas.
   */
  async autoReconcile(companyId: string) {
    const unreconciledInvoices = await this.prisma.invoice.findMany({
      where: { companyId, reconciled: false, status: InvoiceStatus.NORMAL },
    });

    let count = 0;
    for (const invoice of unreconciledInvoices) {
      const match = await this.prisma.bankTransaction.findFirst({
        where: {
          companyId,
          reconciled: false,
          amount: invoice.amount,
          type: TransactionType.CREDIT,
          occurredAt: {
            gte: new Date(invoice.issuedAt.getTime() - 3 * 24 * 60 * 60 * 1000), // Janela de 3 dias
          },
        },
      });

      if (match) {
        await this.prisma.$transaction([
          this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { reconciled: true },
          }),
          this.prisma.bankTransaction.update({
            where: { id: match.id },
            data: { reconciled: true, invoiceId: invoice.id },
          }),
        ]);
        count++;
      }
    }
    return { reconciledCount: count };
  }

  /**
   * MÉTRICAS E INTELIGÊNCIA FISCAL
   * Provisão estimada de imposto baseada no Fator R.
   */
  async getRevenueMetrics(companyId: string, month: number, year: number) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const [metrics, factorRData] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          issuedAt: { gte: startOfMonth, lte: endOfMonth },
          status: InvoiceStatus.NORMAL,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.calculateFactorRUseCase.execute(companyId, endOfMonth),
    ]);

    const totalInvoiced = Number(metrics._sum.amount) || 0;

    // Regra: 6% se Anexo III (Fator R >= 28%), senão 15.5% (Anexo V)
    const estimatedTaxRate = factorRData.isEligibleForAnexoIII ? 0.06 : 0.155;
    const taxProvision = totalInvoiced * estimatedTaxRate;

    await this.prisma.taxCalculation
      .upsert({
        where: { id: `tax_${companyId}_${month}_${year}` },
        update: { totalAmount: totalInvoiced, fatorR: factorRData.factorR },
        create: {
          id: `tax_${companyId}_${month}_${year}`,
          companyId,
          month,
          year,
          totalAmount: totalInvoiced,
          fatorR: factorRData.factorR,
        },
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(`History persistence deferred: ${message}`);
      });

    return {
      period: `${month.toString().padStart(2, '0')}/${year}`,
      totalInvoiced,
      taxProvision,
      invoiceCount: metrics._count.id,
      fiscalIntelligence: {
        factorR: factorRData.factorR,
        isEligibleAnexoIII: factorRData.isEligibleForAnexoIII,
        suggestion: factorRData.suggestion,
      },
    };
  }

  private async createInvoiceFromContract(
    contract: Contract,
  ): Promise<Invoice> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          companyId: contract.companyId,
          customerId: contract.customerId,
          type: InvoiceType.SERVICE,
          status: InvoiceStatus.NORMAL,
          amount: contract.amount,
          issuedAt: new Date(),
          reconciled: false,
        },
      });

      await tx.contract.update({
        where: { id: contract.id },
        data: { lastBillingAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: this.SYSTEM_USER_ID,
          companyId: contract.companyId,
          action: 'AUTO_REVENUE_GENERATION',
          module: 'REVENUE',
          entity: 'Invoice',
          entityId: invoice.id,
          payload: {
            contractId: contract.id,
            amount: contract.amount.toString(),
          },
          statusCode: 201,
          responseTime: 0,
        },
      });

      return invoice;
    });
  }
}
