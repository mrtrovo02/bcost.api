'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, TransactionType, InvoiceStatus } from '@prisma/client';

// ⬇️ AJUSTE CRÍTICO: Caminho relativo para bater com o registro do AppModule
import { PrismaService } from '../../../database/prisma.service.js';
import { CalculateFactorRUseCase } from './calculate-factor-r.use-case.js';

@Injectable()
export class CloseMonthUseCase {
  private readonly logger = new Logger(CloseMonthUseCase.name);

  constructor(
    // Removido o @Inject() explícito para permitir que o Nest use o Type-Hinting do compilador
    private readonly prisma: PrismaService,
    private readonly calculateFactorR: CalculateFactorRUseCase,
  ) {}

  async execute(companyId: string, month: number, year: number) {
    this.logger.log(
      `Iniciando fechamento mensal: ${month}/${year} para empresa ${companyId}`,
    );

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último dia do mês

    // Execução paralela para performance (Enterprise Standard)
    const [revenue, expenses, factorR] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          issuedAt: { gte: startDate, lte: endDate },
          status: InvoiceStatus.NORMAL,
        },
        _sum: { amount: true },
      }),
      this.prisma.bankTransaction.aggregate({
        where: {
          companyId,
          occurredAt: { gte: startDate, lte: endDate },
          type: TransactionType.DEBIT,
        },
        _sum: { amount: true },
      }),
      this.calculateFactorR.execute(companyId, endDate),
    ]);

    const totalRevenue = Number(revenue?._sum?.amount) || 0;
    const totalExpenses = Number(expenses?._sum?.amount) || 0;
    const netProfit = totalRevenue - totalExpenses;

    // Geração de Hash de Integridade (Impedir adulteração de snapshots)
    const rawData = `${companyId}-${month}-${year}-${totalRevenue.toFixed(2)}-${netProfit.toFixed(2)}`;
    const integrityHash = createHash('sha256').update(rawData).digest('hex');

    this.logger.debug(
      `Gerado Integrity Hash para Auditoria: ${integrityHash.substring(0, 8)}...`,
    );

    // Persistência com Upsert Atômico
    return await this.prisma.financialSnapshot.upsert({
      where: {
        // Note: Se o seu schema não tiver 'id' no snapshot, use a chave composta
        // integrityHash: integrityHash ou companyId_month_year
        integrityHash: integrityHash,
      },
      update: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netProfit: netProfit,
        taxPayable: 0,
        fatorRData: factorR as unknown as Prisma.InputJsonValue,
        integrityHash,
      },
      create: {
        companyId,
        month,
        year,
        revenue: totalRevenue,
        expenses: totalExpenses,
        netProfit: netProfit,
        taxPayable: 0,
        fatorRData: factorR as unknown as Prisma.InputJsonValue,
        integrityHash,
      },
    });
  }
}
