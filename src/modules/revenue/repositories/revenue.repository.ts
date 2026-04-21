'use strict';

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

/**
 * RevenueRepository: Camada de persistência para o Ciclo de Receita.
 * Implementa queries otimizadas para faturamento e métricas fiscais (Fator R).
 */
@Injectable()
export class RevenueRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca o faturamento acumulado (Base de Cálculo) dos últimos 12 meses.
   */
  async getRevenueLast12Months(companyId: string, referenceDate: Date) {
    const twelveMonthsAgo = new Date(referenceDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    return this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: 'NORMAL',
        issuedAt: {
          gte: twelveMonthsAgo,
          lte: referenceDate,
        },
      },
      _sum: {
        amount: true,
      },
    });
  }

  /**
   * Busca a massa salarial acumulada (Folha de Pagamento) dos últimos 12 meses.
   * Ajustado para os campos reais: 'createdAt' e 'totalAmount'.
   */
  async getPayrollLast12Months(companyId: string, referenceDate: Date) {
    const twelveMonthsAgo = new Date(referenceDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    return this.prisma.payroll.aggregate({
      where: {
        companyId,
        // Usando createdAt como data de referência conforme seu schema
        createdAt: {
          gte: twelveMonthsAgo,
          lte: referenceDate,
        },
      },
      _sum: {
        // Usando totalAmount conforme seu schema
        totalAmount: true,
        salariesAmount: true,
        proLaboreAmount: true,
      },
    });
  }

  /**
   * Upsert de cálculos tributários para histórico e dashboard.
   */
  async upsertTaxCalculation(data: {
    companyId: string;
    month: number;
    year: number;
    totalAmount: number;
    fatorR: number;
  }) {
    return this.prisma.taxCalculation.upsert({
      where: {
        companyId_month_year: {
          companyId: data.companyId,
          month: data.month,
          year: data.year,
        },
      },
      update: {
        totalAmount: data.totalAmount,
        fatorR: data.fatorR,
      },
      create: {
        companyId: data.companyId,
        month: data.month,
        year: data.year,
        totalAmount: data.totalAmount,
        fatorR: data.fatorR,
      },
    });
  }
}
