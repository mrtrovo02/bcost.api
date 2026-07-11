'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { addDays, format, subMonths, isSameDay } from 'date-fns';
import { Prisma, ObligationStatus } from '@prisma/client';

export type ProjectionItem = {
  date: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedBalance: number;
};

@Injectable()
export class CashFlowProjectionService {
  private readonly logger = new Logger(CashFlowProjectionService.name);

  constructor(private prisma: PrismaService) {}

  async generateProjection(
    companyId: string,
    days: number = 90,
  ): Promise<ProjectionItem[]> {
    this.logger.debug(
      `🔮 Gerando motor preditivo para empresa ${companyId} (${days} dias)`,
    );

    // 🚀 CORREÇÃO TS2353 & TS2339: Alterado 'balance' para 'balanceCache'
    const accounts = await this.prisma.bankAccount.findMany({
      where: { companyId },
      select: { balanceCache: true },
    });
    const currentBalance = accounts.reduce(
      (sum, acc) => sum + Number(acc.balanceCache || 0),
      0,
    );

    const horizonDate = addDays(new Date(), days);
    const startHistorical = subMonths(new Date(), 12);

    const [transactions, pendingInvoices, taxObligations] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: { companyId, occurredAt: { gte: startHistorical } },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.invoice.findMany({
        where: {
          companyId,
          // 🚀 Ajustado para capturar PENDING (conforme nosso Seed)
          status: { in: ['PENDING', 'NORMAL'] as any },
          issuedAt: { lte: horizonDate },
        },
        select: { amount: true, issuedAt: true },
      }),
      this.prisma.taxObligation.findMany({
        where: {
          companyId,
          status: 'PENDING' as any,
          dueDate: { lte: horizonDate },
        },
        select: { amount: true, dueDate: true },
      }),
    ]);

    const dailyHistoricalTotals = this.aggregateByDay(transactions);

    const projection = this.forecast(
      dailyHistoricalTotals,
      days,
      currentBalance,
      pendingInvoices,
      taxObligations,
    );

    // Persistência com Upsert lógico: criamos um novo snapshot de projeção
    const today = new Date();
    await this.prisma.cashFlowProjection.create({
      data: {
        companyId,
        projectionDate: today,
        data: projection as unknown as Prisma.InputJsonValue,
      },
    });

    return projection;
  }

  private aggregateByDay(transactions: any[]) {
    const map = new Map<string, { income: number; expense: number }>();

    for (const t of transactions) {
      const day = format(t.occurredAt, 'yyyy-MM-dd');
      const current = map.get(day) || { income: 0, expense: 0 };
      const amount = Math.abs(Number(t.amount));

      // Aceita tanto o padrão de Invoice quanto o de transação bancária
      if (t.type === 'CREDIT' || t.type === 'REVENUE') {
        current.income += amount;
      } else {
        current.expense += amount;
      }
      map.set(day, current);
    }

    return Array.from(map.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private forecast(
    historical: any[],
    days: number,
    initialBalance: number,
    pendingInvoices: any[],
    taxObligations: any[],
  ): ProjectionItem[] {
    const recent = historical.slice(-60);

    // 📉 Cálculo de Tendência (Regressão Linear)
    const trend = this.calculateTrend(recent);

    const avgDailyIncome =
      recent.length > 0
        ? recent.reduce((sum, d) => sum + d.income, 0) / recent.length
        : 0;
    const avgDailyExpense =
      recent.length > 0
        ? recent.reduce((sum, d) => sum + d.expense, 0) / recent.length
        : 0;

    const start = new Date();
    const projection: ProjectionItem[] = [];
    let runningBalance = initialBalance;

    for (let i = 0; i < days; i++) {
      const currentDate = addDays(start, i);
      const dateKey = format(currentDate, 'yyyy-MM-dd');

      // Soma faturas reais para o dia específico
      const realInvoices = pendingInvoices
        .filter((inv) => isSameDay(new Date(inv.issuedAt), currentDate))
        .reduce((sum, inv) => sum + Number(inv.amount), 0);

      // Soma impostos reais para o dia específico
      const realTaxes = taxObligations
        .filter((tax) => isSameDay(new Date(tax.dueDate), currentDate))
        .reduce((sum, tax) => sum + Number(tax.amount), 0);

      // Aplica tendência sobre a média histórica para dias sem faturas reais
      const trendFactor = 1 + trend * i;
      const projectedIncome =
        realInvoices > 0 ? realInvoices : avgDailyIncome * trendFactor;
      const projectedExpense =
        realTaxes + (realTaxes > 0 ? 0 : avgDailyExpense);

      runningBalance += projectedIncome - projectedExpense;

      projection.push({
        date: dateKey,
        projectedIncome: Number(projectedIncome.toFixed(2)),
        projectedExpense: Number(projectedExpense.toFixed(2)),
        projectedBalance: Number(runningBalance.toFixed(2)),
      });
    }

    return projection;
  }

  private calculateTrend(data: any[]): number {
    if (data.length < 2) return 0;

    const n = data.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;

    for (let i = 0; i < n; i++) {
      const val = data[i].income - data[i].expense;
      sumX += i;
      sumY += val;
      sumXY += i * val;
      sumXX += i * i;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    return (slope / (sumY / n || 1)) * 0.01;
  }

  async getLatestProjection(companyId: string, days?: number) {
    const latest = await this.prisma.cashFlowProjection.findFirst({
      where: { companyId },
      orderBy: { projectionDate: 'desc' },
    });

    if (latest && latest.data) {
      const dataArray = latest.data as unknown as ProjectionItem[];
      return days ? dataArray.slice(0, days) : dataArray;
    }

    return this.generateProjection(companyId, days);
  }
}
