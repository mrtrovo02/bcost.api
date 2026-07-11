import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processBilling(companyId: string) {
    return this.processBillingInternal(companyId);
  }

  async processBillingInternal(companyId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    let processed = 0;

    for (const contract of contracts) {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const existing = await this.prisma.invoice.findFirst({
          where: {
            companyId,
            customerId: contract.customerId,
            issuedAt: { gte: startOfDay },
            deletedAt: null,
          },
        });

        if (existing) continue;

        await this.prisma.$transaction(async (tx) => {
          const invoice = await tx.invoice.create({
            data: {
              companyId,
              customerId: contract.customerId,
              amount: contract.amount,
              type: 'SERVICE',
              status: 'NORMAL',
              issuedAt: new Date(),
              reconciled: false,
            },
          });

          await tx.contract.update({
            where: { id: contract.id },
            data: { lastBillingAt: new Date() },
          });

          try {
            await tx.auditLog.create({
              data: {
                companyId,
                action: 'AUTO_REVENUE_GENERATION',
                module: 'REVENUE',
                entity: 'INVOICE',
                entityId: invoice.id,
                payload: {
                  contractId: contract.id,
                  invoiceId: invoice.id,
                  amount: contract.amount.toString(),
                },
                statusCode: 201,
              },
            });
          } catch {
            this.logger.warn('Audit log skipped');
          }
        });

        processed++;
      } catch (err) {
        this.logger.error(`❌ Falha no contrato ${contract.id}`, err);
      }
    }

    return { processed };
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

  async getFactorR(companyId: string) {
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));

    const revenueAgg = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: InvoiceStatus.NORMAL,
        deletedAt: null,
        issuedAt: { gte: startDate },
      },
      _sum: { amount: true },
    });

    const payrollAgg = await this.prisma.payroll.aggregate({
      where: {
        companyId,
        
      },
      _sum: { totalAmount: true },
    });

    const revenueLast12Months = revenueAgg._sum.amount?.toNumber() ?? 0;
    const payrollLast12Months = payrollAgg._sum.totalAmount?.toNumber() ?? 0;

    const value =
      revenueLast12Months > 0
        ? Number((payrollLast12Months / revenueLast12Months).toFixed(4))
        : 0;

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
}
