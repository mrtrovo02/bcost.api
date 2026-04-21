'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { RevenueRepository } from '../repositories/revenue.repository.js';
import { Prisma } from '@prisma/client';

/**
 * Interface de Resposta baseada na regra de negócio do Simples Nacional.
 */
export interface CalculateFactorRResponse {
  factorR: number;
  isEligibleForAnexoIII: boolean;
  revenue12: number;
  payroll12: number;
  suggestion: string;
}

@Injectable()
export class CalculateFactorRUseCase {
  private readonly logger = new Logger(CalculateFactorRUseCase.name);

  constructor(private readonly revenueRepository: RevenueRepository) {}

  /**
   * Executa o cálculo do Fator R: (Soma da Folha 12m) / (Soma do Faturamento 12m)
   * Utiliza a biblioteca Decimal.js embutida no Prisma para garantir precisão financeira.
   */
  async execute(
    companyId: string,
    referenceDate: Date = new Date(),
  ): Promise<CalculateFactorRResponse> {
    this.logger.log(`Iniciando cálculo de Fator R para Company: ${companyId}`);

    // Busca os dados agregados via Repositório
    const [revenueData, payrollData] = await Promise.all([
      this.revenueRepository.getRevenueLast12Months(companyId, referenceDate),
      this.revenueRepository.getPayrollLast12Months(companyId, referenceDate),
    ]);

    // O Prisma aggregate _sum retorna Decimal | null.
    // Instanciamos como Prisma.Decimal para usar os métodos .isZero(), .div(), etc.
    const revenue12 = new Prisma.Decimal(revenueData._sum?.amount || 0);
    const payroll12 = new Prisma.Decimal(payrollData._sum?.totalAmount || 0);

    // Regra de Ouro: Divisão por zero
    if (revenue12.isZero()) {
      return {
        factorR: 0,
        isEligibleForAnexoIII: false,
        revenue12: 0,
        payroll12: payroll12.toNumber(),
        suggestion:
          'Sem faturamento detectado nos últimos 12 meses. Base de cálculo zerada.',
      };
    }

    // Cálculo: (Folha / Faturamento)
    const factorRDecimal = payroll12.div(revenue12);
    const factorR = factorRDecimal.toNumber();

    // O Fator R deve ser igual ou superior a 28% (0.28) para o Anexo III
    const isEligible = factorR >= 0.28;

    this.logger.debug(
      `Resultado Fator R: ${factorR.toFixed(4)} | Elegível: ${isEligible}`,
    );

    return {
      factorR,
      isEligibleForAnexoIII: isEligible,
      revenue12: revenue12.toNumber(),
      payroll12: payroll12.toNumber(),
      suggestion: isEligible
        ? 'Empresa elegível ao Anexo III (Economia tributária ativa).'
        : 'Alerta: Fator R abaixo de 28%. Considere ajustar o Pró-labore para reenquadramento.',
    };
  }
}
