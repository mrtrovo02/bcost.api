'use strict';

import { Injectable } from '@nestjs/common';
import { PrismaService } from '#database/prisma.service.js';
import { RevenueRepository } from '#modules/revenue/repositories/revenue-repository.abstract.js';
import { Prisma } from '@prisma/client';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';

@Injectable()
export class PrismaRevenueRepository implements RevenueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLast12MonthsRevenue(
    companyId: string,
    referenceDate: Date,
  ): Promise<Prisma.Decimal> {
    const startDate = startOfMonth(subMonths(referenceDate, 12));
    const endDate = endOfMonth(subMonths(referenceDate, 1));

    const result = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        issuedAt: { gte: startDate, lte: endDate },
        status: 'NORMAL',
      },
      _sum: { amount: true },
    });

    // O fallback utiliza o construtor Decimal exposto pelo namespace Prisma.
    return result._sum.amount || new Prisma.Decimal(0);
  }

  async getLast12MonthsPayroll(
    companyId: string,
    referenceDate: Date,
  ): Promise<Prisma.Decimal> {
    const startDate = startOfMonth(subMonths(referenceDate, 12));
    const endDate = endOfMonth(subMonths(referenceDate, 1));

    const result = await this.prisma.payroll.aggregate({
      where: {
        companyId,
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { totalAmount: true },
    });

    return result._sum.totalAmount || new Prisma.Decimal(0);
  }
}
