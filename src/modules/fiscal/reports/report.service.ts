'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  ComplianceService,
  ComplianceReport,
} from '../compliance/compliance.service.js';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export interface MonthlyReportOutput {
  period: { month: number; year: number; refMonth: string };
  compliance: {
    score: number;
    status: ComplianceReport['status'];
    findings: ComplianceReport['findings'];
  };
  stats: {
    totalRevenue: number;
    invoiceCount: number;
    payrollAmount: number;
    factorR: number;
  };
  breakdown: Array<{
    type: string;
    count: number;
    total: number;
  }>;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly complianceService: ComplianceService,
  ) {}

  /**
   * Fechamento consolidado mensal.
   * Cruza Invoices, Payroll e Compliance para gerar o relatório do período.
   */
  async getMonthlyConsolidatedReport(
    companyId: string,
    month: number,
    year: number,
  ): Promise<MonthlyReportOutput> {
    this.logger.log(
      `[Reports] Gerando fechamento ${month}/${year} para empresa ${companyId}`,
    );

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    // refMonth mantido apenas para exibição no output — não é mais chave de query
    const refMonth = `${year}-${String(month).padStart(2, '0')}`;

    const [compliance, invoices, payroll] = await Promise.all([
      this.complianceService.runFullComplianceAudit(companyId),

      this.prisma.invoice.groupBy({
        by: ['type'],
        where: {
          companyId,
          issuedAt: { gte: startDate, lte: endDate },
          status: InvoiceStatus.NORMAL,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),

      // FIX: referenceMonth: refMonth → month + year como Int
      this.prisma.payroll.findFirst({
        where: { companyId, month, year },
      }),
    ]);

    const totalRevenueDecimal = invoices.reduce(
      (acc, curr) => acc.plus(curr._sum.amount ?? 0),
      new Prisma.Decimal(0),
    );
    const totalInvoiceCount = invoices.reduce(
      (acc, curr) => acc + curr._count.id,
      0,
    );

    return {
      period: { month, year, refMonth },
      compliance: {
        score: compliance.score,
        status: compliance.status,
        findings: compliance.findings,
      },
      stats: {
        totalRevenue: totalRevenueDecimal.toNumber(),
        invoiceCount: totalInvoiceCount,
        payrollAmount: payroll ? Number(payroll.totalAmount) : 0,
        factorR: compliance.fatorR?.current ?? 0, // FIX: || → ?? (0 é valor válido)
      },
      breakdown: invoices.map((inv) => ({
        type: inv.type,
        count: inv._count.id,
        total: Number(inv._sum.amount ?? 0), // FIX: || → ?? (0 é valor válido)
      })),
    };
  }

  /**
   * DRE (PnL) em tempo real do mês corrente.
   * Compara Receita (serviços) x Custos (compras via DFe).
   */
  async getRealTimePnL(companyId: string) {
    this.logger.debug(
      `[Analytics] Calculando PnL Real-Time para Empresa: ${companyId}`,
    );

    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [revenue, expenses] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          type: InvoiceType.SERVICE,
          issuedAt: { gte: startOfMonth },
          status: InvoiceStatus.NORMAL,
        },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          type: InvoiceType.PURCHASE,
          issuedAt: { gte: startOfMonth },
          status: InvoiceStatus.NORMAL,
        },
        _sum: { amount: true },
      }),
    ]);

    const totalIn = new Prisma.Decimal(revenue._sum.amount ?? 0); // FIX: || → ??
    const totalOut = new Prisma.Decimal(expenses._sum.amount ?? 0); // FIX: || → ??
    const grossProfit = totalIn.minus(totalOut);
    const margin = totalIn.isZero()
      ? new Prisma.Decimal(0)
      : grossProfit.div(totalIn).mul(100);

    return {
      companyId,
      period: `${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`,
      metrics: {
        revenue: totalIn.toNumber(),
        costs: totalOut.toNumber(),
        grossProfit: Number(grossProfit.toFixed(2)),
        margin: Number(margin.toFixed(2)),
      },
      timestamp: now.toISOString(),
    };
  }
}
