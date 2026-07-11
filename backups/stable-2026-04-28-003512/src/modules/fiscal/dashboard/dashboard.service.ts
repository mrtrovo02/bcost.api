'use strict';

import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { FiscalService } from '../fiscal.service.js';
import { InvoiceStatus, Prisma } from '@prisma/client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalService: FiscalService,
  ) {}

  /**
   * Consolida KPIs financeiros, fiscais e alertas de conformidade.
   */
  async getExecutiveSummary(companyId: string) {
    this.logger.log(
      `[bCost Dashboard] Consolidando inteligência: Empresa ${companyId}`,
    );

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company)
        throw new NotFoundException('Unidade de negócio não encontrada.');

      const [
        taxProjection,
        yearlyData,
        captureStats,
        lastPayroll,
        previousMonthData,
        pendingAggregate,
      ] = await Promise.all([
        this.fiscalService
          .calculateMonthlyTax(companyId, currentMonth, currentYear)
          .catch(() => null),
        this.fetchYearlyData(companyId, currentYear),
        this.fetchCaptureStats(companyId),

        // FIX: referenceMonth → orderBy [year desc, month desc]
        this.prisma.payroll.findFirst({
          where: { companyId },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        }),

        this.fetchPreviousMonthRevenue(companyId, currentMonth, currentYear),
        this.fetchPendingInvoicesAggregate(
          companyId,
          currentMonth,
          currentYear,
        ),
      ]);

      const totalRevenueYTD = new Prisma.Decimal(yearlyData._sum?.amount ?? 0);
      const avgRevenue =
        currentMonth > 0
          ? totalRevenueYTD.div(currentMonth)
          : new Prisma.Decimal(0);

      const currentMonthRevenue = new Prisma.Decimal(
        taxProjection?.metrics?.faturamentoMes ?? 0,
      );
      const growthMoM = this.calculateGrowth(
        currentMonthRevenue,
        previousMonthData,
      );

      const history = await this.prisma.$queryRaw<
        { month: Date; total: number; volume: number }[]
      >`
        SELECT
          date_trunc('month', "issuedAt") as month,
          SUM("amount")::FLOAT                as total,
          COUNT(id)::INT                      as volume
        FROM "invoices"
        WHERE "companyId" = ${companyId}::uuid
          AND "status"    = ${InvoiceStatus.NORMAL}::"InvoiceStatus"
          AND "issuedAt" >= (CURRENT_DATE - INTERVAL '12 months')
        GROUP BY 1
        ORDER BY 1 ASC
      `.catch((err: Error) => {
        this.logger.error(
          `[SQL Error] Erro na query de histórico: ${err.message}`,
        );
        return [];
      });

      const impostoAPagar = new Prisma.Decimal(
        taxProjection?.financial?.impostoAPagar ?? 0,
      );
      const netMargin = currentMonthRevenue.gt(0)
        ? currentMonthRevenue
            .minus(impostoAPagar)
            .div(currentMonthRevenue)
            .mul(100)
        : new Prisma.Decimal(0);

      return {
        kpis: {
          revenueYTD: totalRevenueYTD.toNumber(),
          currentMonthRevenue: currentMonthRevenue.toNumber(),
          avgMonthlyRevenue: Number(avgRevenue.toFixed(2)),
          growthMoM: Number(growthMoM.toFixed(2)),
          projectedTax: impostoAPagar.toNumber(),
          taxEfficiency: Number(taxProjection?.metrics?.aliqEfetiva ?? 0),
          netMarginPercent: Number(netMargin.toFixed(2)),
          notasPendentesMes: pendingAggregate.count,
        },
        taxAlerts: {
          fatorR: Number(taxProjection?.metrics?.fatorR ?? 0),
          anexoAtual: taxProjection?.metrics?.anexoUtilizado ?? 'Apurando...',
          potentialSavings: Number(
            taxProjection?.financial?.economiaFatorR ?? 0,
          ),
          // FIX: shouldAlertPayroll recebe month + year em vez de referenceMonth string
          isPayrollPending: this.shouldAlertPayroll(
            lastPayroll,
            currentMonth,
            currentYear,
          ),
          fatorRStatus:
            (taxProjection?.metrics?.fatorR ?? 0) >= 28 ? 'IDEAL' : 'CRITICO',
          lastSync: company.updatedAt,
        },
        operation: {
          reconciledCount: captureStats.reconciled,
          pendingCount: captureStats.pending,
          efficiencyRate:
            captureStats.total > 0
              ? Number(
                  (
                    (captureStats.reconciled / captureStats.total) *
                    100
                  ).toFixed(1),
                )
              : 0,
        },
        chartData: this.formatChartData(history),
        metadata: {
          companyId,
          dataIntegrity: history.length >= 3 ? 'STABLE' : 'COLLECTING',
          generatedAt: new Date().toISOString(),
          engineVersion: '2026.1.1-enterprise',
        },
      };
    } catch (error: unknown) {
      // FIX: error: any → error: unknown com narrowing correto
      if (error instanceof NotFoundException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Dashboard Critical] Falha na consolidação: ${message}`,
      );
      throw new InternalServerErrorException(
        'Erro ao processar inteligência do dashboard.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Métodos de Suporte
  // ---------------------------------------------------------------------------

  private async fetchCaptureStats(companyId: string) {
    const stats = await this.prisma.invoice.groupBy({
      by: ['reconciled'],
      where: { companyId },
      _count: { id: true },
    });

    const reconciledObj = stats.find((s) => s.reconciled === true);
    const pendingObj = stats.find((s) => s.reconciled === false);

    const reconciled = reconciledObj?._count?.id ?? 0;
    const pending = pendingObj?._count?.id ?? 0;

    return { reconciled, pending, total: reconciled + pending };
  }

  private async fetchYearlyData(companyId: string, year: number) {
    return this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: InvoiceStatus.NORMAL,
        issuedAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
      },
      _sum: { amount: true },
    });
  }

  private async fetchPendingInvoicesAggregate(
    companyId: string,
    month: number,
    year: number,
  ) {
    const startOfMonth = new Date(year, month - 1, 1);
    const agg = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        reconciled: false,
        issuedAt: { gte: startOfMonth },
      },
      _count: { id: true },
      _sum: { amount: true },
    });

    return {
      count: agg._count?.id ?? 0,
      totalAmount: new Prisma.Decimal(agg._sum?.amount ?? 0).toNumber(),
    };
  }

  private async fetchPreviousMonthRevenue(
    companyId: string,
    month: number,
    year: number,
  ): Promise<Prisma.Decimal> {
    const prevDate = new Date(year, month - 2, 1);
    const lastDayPrevMonth = new Date(year, month - 1, 0, 23, 59, 59);

    const data = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: InvoiceStatus.NORMAL,
        issuedAt: { gte: prevDate, lte: lastDayPrevMonth },
      },
      _sum: { amount: true },
    });

    return new Prisma.Decimal(data._sum?.amount ?? 0);
  }

  private calculateGrowth(
    current: Prisma.Decimal,
    previous: Prisma.Decimal,
  ): number {
    if (previous.isZero()) return current.gt(0) ? 100 : 0;
    return current.minus(previous).div(previous).mul(100).toNumber();
  }

  /**
   * FIX: lastPayroll agora tem { month: number, year: number } em vez de referenceMonth string.
   * Compara o último payroll registrado com o mês anterior ao corrente.
   */
  private shouldAlertPayroll(
    lastPayroll: { month: number; year: number } | null,
    currentMonth: number,
    currentYear: number,
  ): boolean {
    if (!lastPayroll) return true;

    // Mês alvo = mês anterior ao corrente
    const targetDate = new Date(currentYear, currentMonth - 2, 1);
    const lastDate = new Date(lastPayroll.year, lastPayroll.month - 1, 1);

    return lastDate < targetDate;
  }

  private formatChartData(
    history: { month: Date; total: number; volume: number }[],
  ) {
    if (!history.length) {
      return [{ label: 'AGUARDANDO', faturamento: 0, volume: 0 }];
    }

    return history.map((h) => ({
      label: new Date(h.month)
        .toLocaleString('pt-BR', { month: 'short' })
        .toUpperCase()
        .replace('.', ''),
      faturamento: Number(h.total ?? 0),
      volume: h.volume ?? 0,
    }));
  }
}
