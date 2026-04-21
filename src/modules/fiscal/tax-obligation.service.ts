'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { FiscalService } from './fiscal.service.js';
import { Prisma, ObligationStatus } from '@prisma/client';

@Injectable()
export class TaxObligationService {
  private readonly logger = new Logger(TaxObligationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalService: FiscalService,
  ) {}

  /**
   * GERAÇÃO DE GUIA: Transforma o cálculo do Simples Nacional em uma obrigação pendente.
   * Alinhado ao Schema 2026 (TaxObligation).
   */
  async generateMonthlyDAS(companyId: string, month: number, year: number) {
    this.logger.log(
      `[TaxEngine] Gerando guia DAS para Empresa: ${companyId} - Período: ${month}/${year}`,
    );

    // 1. Recupera os cálculos oficiais do motor fiscal
    const taxData = await this.fiscalService.calculateMonthlyTax(
      companyId,
      month,
      year,
    );

    if (taxData.financial.impostoAPagar <= 0) {
      this.logger.warn(
        `[TaxEngine] Faturamento zero ou sem impostos para o período.`,
      );
      return { message: 'Nenhum imposto devido para este período.' };
    }

    // 2. Define a data de vencimento (Padrão: dia 20 do mês seguinte)
    const dueDate = new Date(year, month, 20);
    const obligationName = `DAS - Simples Nacional - ${month.toString().padStart(2, '0')}/${year}`;

    // 3. Persistência no Schema 2026
    // Usamos findFirst + create (ou upsert se houvesse chave única composta)
    const existing = await this.prisma.taxObligation.findFirst({
      where: {
        companyId,
        name: obligationName,
        dueDate,
      },
    });

    if (existing) {
      this.logger.log(`[TaxEngine] Obrigação já existe: ${existing.id}`);
      return existing;
    }

    const obligation = await this.prisma.taxObligation.create({
      data: {
        companyId,
        name: obligationName,
        amount: new Prisma.Decimal(taxData.financial.impostoAPagar),
        dueDate,
        status: ObligationStatus.PENDING,
      },
    });

    this.logger.log(
      `✅ Guia gerada com sucesso: ${obligation.id} | Valor: R$ ${obligation.amount.toString()}`,
    );

    return obligation;
  }

  /**
   * AUDITORIA DE PENDÊNCIAS: Lista obrigações por status para o Dashboard.
   */
  async getPendingTaxes(companyId: string) {
    return this.prisma.taxObligation.findMany({
      where: {
        companyId,
        status: { in: [ObligationStatus.PENDING, ObligationStatus.OVERDUE] },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * INTEGRAÇÃO COM CONCILIAÇÃO: Marca imposto como pago após batimento bancário.
   */
  async markAsPaid(taxObligationId: string) {
    return this.prisma.taxObligation.update({
      where: { id: taxObligationId },
      data: { status: ObligationStatus.PAID },
    });
  }
}
