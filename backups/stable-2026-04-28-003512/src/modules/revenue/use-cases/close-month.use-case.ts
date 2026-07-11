'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { RevenueRepository } from '../repositories/revenue.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * CloseMonthUseCase: Consolida o faturamento e gera o snapshot fiscal do período.
 * Essencial para auditoria e geração automática de guias de imposto (DAS).
 */
@Injectable()
export class CloseMonthUseCase {
  private readonly logger = new Logger(CloseMonthUseCase.name);

  constructor(
    private readonly revenueRepository: RevenueRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(companyId: string, month: number, year: number) {
    this.logger.log(`🔒 Iniciando fechamento do mês ${month}/${year} para empresa: ${companyId}`);

    // 1. Validação de Competência (Não fecha meses futuros)
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
      throw new BadRequestException('Não é possível fechar uma competência futura.');
    }

    // 2. Busca dados finais para o Snapshot
    const referenceDate = new Date(year, month, 0); // Último dia do mês solicitado
    const [revenueData, payrollData] = await Promise.all([
      this.revenueRepository.getRevenueLast12Months(companyId, referenceDate),
      this.revenueRepository.getPayrollLast12Months(companyId, referenceDate),
    ]);

    const totalRevenue = Number(revenueData._sum?.amount) || 0;
    const totalPayroll = Number(payrollData._sum?.totalAmount) || 0;
    const factorR = totalRevenue > 0 ? totalPayroll / totalRevenue : 0;

    // 3. Persistência Atômica do Fechamento
    const taxEntry = await this.revenueRepository.upsertTaxCalculation({
      companyId,
      month,
      year,
      totalAmount: totalRevenue,
      fatorR: factorR,
    });

    // 4. Disparo de Evento para Módulos Externos (Notificações, Contabilidade, BI)
    this.eventEmitter.emit('month.closed', {
      companyId,
      period: `${month}/${year}`,
      factorR: factorR.toFixed(4),
      isEligibleAnexoIII: factorR >= 0.28,
    });

    this.logger.log(`✅ Mês ${month}/${year} fechado com sucesso para ${companyId}`);

    return {
      message: 'Mês encerrado com sucesso.',
      snapshot: {
        totalRevenue,
        totalPayroll,
        factorR: Number(factorR.toFixed(4)),
        closedAt: new Date(),
      },
    };
  }
}
