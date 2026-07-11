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

@Injectable()
export class FactorREngineService {
  private readonly logger = new Logger(FactorREngineService.name);

  constructor(private prisma: PrismaService) {}

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
      // Aqui usamos a lógica de fallback: se o campo não existe na tipagem do Prisma,
      // buscamos dentro do campo fatorRData ou usamos 0.
      const data = s.fatorRData as any;
      const salaries = data?.salariesAmount || 0;
      const proLabore = data?.proLaboreAmount || 0;
      const taxes = data?.taxesAmount || 0;

      return acc
        .add(new Prisma.Decimal(salaries))
        .add(new Prisma.Decimal(proLabore))
        .add(new Prisma.Decimal(taxes));
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
        ? 'Alíquota 6%'
        : 'Alíquota 15.5%',
    };
  }
}
