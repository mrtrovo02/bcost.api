'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { RevenueRepository } from '../repositories/revenue.repository.js';
import { FactorRResponseDto } from '../dto/factor-r-response.dto.js';

/**
 * CalculateFactorRUseCase: Inteligência fiscal para enquadramento no Simples Nacional.
 * Calcula a relação entre folha de pagamento e faturamento (R = Massa Salarial / Receita Bruta).
 */
@Injectable()
export class CalculateFactorRUseCase {
  private readonly logger = new Logger(CalculateFactorRUseCase.name);

  constructor(private readonly revenueRepository: RevenueRepository) {}

  async execute(companyId: string): Promise<FactorRResponseDto> {
    const referenceDate = new Date();
    this.logger.log(`🎬 Iniciando cálculo de Fator R para empresa: ${companyId}`);

    // 1. Busca dados agregados utilizando o Repository (Garante consistência com o banco)
    // Usamos Promise.all para executar as queries em paralelo e reduzir o tempo de resposta
    const [revenueData, payrollData] = await Promise.all([
      this.revenueRepository.getRevenueLast12Months(companyId, referenceDate),
      this.revenueRepository.getPayrollLast12Months(companyId, referenceDate),
    ]);

    // Conversão segura para Number (Tratando possíveis retornos null/Decimal do Prisma)
    const totalRevenue = Number(revenueData._sum?.amount) || 0;
    const totalPayroll = Number(payrollData._sum?.totalAmount) || 0;

    // 2. Aplicação da Regra Fiscal: Fator R
    const factorR = totalRevenue > 0 ? totalPayroll / totalRevenue : 0;
    const isEligible = factorR >= 0.28;

    this.logger.debug(`📊 Resultado ${companyId}: Faturamento R$${totalRevenue} | Folha R$${totalPayroll} | Fator R: ${factorR.toFixed(4)}`);

    // 3. Persistência do resultado para histórico e Dashboards
    // Isso garante que o cálculo consultado via API fique registrado na tabela de tributação
    await this.revenueRepository.upsertTaxCalculation({
      companyId,
      month: referenceDate.getMonth() + 1,
      year: referenceDate.getFullYear(),
      totalAmount: totalRevenue,
      fatorR: factorR,
    });

    return {
      value: Number(factorR.toFixed(4)),
      isEligibleForAnexoIII: isEligible,
      revenueLast12Months: totalRevenue,
      payrollLast12Months: totalPayroll,
      analysis: isEligible
        ? 'Elegível ao Anexo III. Alíquota de imposto reduzida (mín. 6%).'
        : 'Sujeito ao Anexo V. Fator R abaixo de 28%. Alíquota majorada (mín. 15.5%).',
    };
  }
}
