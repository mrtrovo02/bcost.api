'use strict';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '@prisma/client'; // ✅ Importação correta para tipos e Decimal

/**
 * Interface de Resultado do Fator R corrigida para NDE.
 */
export interface FactorRResult {
  currentFactorR: number;
  isEnquadradoAnexoIII: boolean;
  rbt12: number;
  payroll12m: number;
  recommendation: string;
  potentialTaxSaving: string;
}

type FactorRPayrollData = {
  salariesAmount?: unknown;
  proLaboreAmount?: unknown;
  taxesAmount?: unknown;
};

@Injectable()
export class FactorREngineService {
  private readonly logger = new Logger(FactorREngineService.name);

  constructor(private prisma: PrismaService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private parsePayrollData(value: Prisma.JsonValue): FactorRPayrollData {
    return this.isRecord(value) ? value : {};
  }

  private toDecimal(value: unknown): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) return value;

    const parsed = Number(value ?? 0);
    return new Prisma.Decimal(Number.isFinite(parsed) ? parsed : 0);
  }

  async calculate(
    companyId: string,
    month: number,
    year: number,
  ): Promise<FactorRResult> {
    this.logger.log(`🚀 Calculando Fator R para Empresa: ${companyId}`);

    const history = await this.prisma.financialSnapshot.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });

    if (history.length === 0) {
      throw new NotFoundException('Histórico financeiro insuficiente.');
    }

    // ✅ RESOLUÇÃO DOS ERROS 2339: Extração segura dos campos
    // Se os campos não estão na raiz da tabela, eles devem ser lidos do JsonValue ou definidos como 0
    const totalRevenue12m = history.reduce(
      (acc, s) => acc.add(s.revenue),
      new Prisma.Decimal(0),
    );

    const totalPayroll12m = history.reduce((acc, s) => {
      const data = this.parsePayrollData(s.fatorRData);

      return acc
        .add(this.toDecimal(data.salariesAmount))
        .add(this.toDecimal(data.proLaboreAmount))
        .add(this.toDecimal(data.taxesAmount));
    }, new Prisma.Decimal(0));

    const factorR = totalRevenue12m.isZero()
      ? 0
      : totalPayroll12m.div(totalRevenue12m).toNumber();
    const isEnquadradoAnexoIII = factorR >= 0.28;

    const targetPayroll = totalRevenue12m.mul(0.28);
    const deficit = targetPayroll.sub(totalPayroll12m);

    const recommendation =
      deficit.toNumber() > 0
        ? `Aumentar Pro-labore em R$ ${deficit.toFixed(2)}.`
        : 'Estratégia otimizada.';

    // ✅ Persistência garantindo consistência de tipos
    await this.prisma.taxCalculation.upsert({
      where: { companyId_month_year: { companyId, month, year } },
      update: { fatorR: factorR, rbt12: totalRevenue12m },
      create: {
        companyId,
        month,
        year,
        fatorR: factorR,
        rbt12: totalRevenue12m,
        totalAmount: 0,
      },
    });

    return {
      currentFactorR: Number(factorR.toFixed(4)),
      isEnquadradoAnexoIII,
      rbt12: totalRevenue12m.toNumber(),
      payroll12m: totalPayroll12m.toNumber(),
      recommendation,
      potentialTaxSaving: isEnquadradoAnexoIII
        ? 'Elegível ao Anexo III; a alíquota efetiva depende da faixa RBT12.'
        : 'Sujeito ao Anexo V; a alíquota efetiva depende da faixa RBT12.',
    };
  }
}
