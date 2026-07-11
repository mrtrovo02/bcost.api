'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FinancialLedgerService } from '../../financial/services/financial-ledger.service.js';
import { FinancialEventType } from '@prisma/client';

@Injectable()
export class TaxComplianceService {
  private readonly logger = new Logger(TaxComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinancialLedgerService,
    @InjectQueue('tax-processing') private taxQueue: Queue,
  ) {}

  async scheduleTaxCalculation(invoiceId: string, companyId: string) {
    this.logger.log(`Agendando cálculo fiscal para nota ${invoiceId}`);

    await this.taxQueue.add(
      'calculate-taxes',
      {
        invoiceId,
        companyId,
      },
      {
        priority: 1,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  async processTaxes(invoiceId: string, companyId: string) {
    // Usamos o 'extended' para garantir que o isolamento de tenant funcione
    return this.prisma.extended.$transaction(async (tx: any) => {
      // 1. Busca a Invoice - Removido 'items' que não existe no seu schema
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice)
        throw new BadRequestException('Nota fiscal não encontrada.');

      // 2. Lógica de cálculo (18% sobre o amount decimal)
      const taxAmount = Number(invoice.amount) * 0.18;

      // 3. Registro no Ledger
      // FIX: Usando 'TAX_PAID' ou 'MANUAL_ADJUSTMENT' que são tipos válidos no seu Enum
      await this.ledger.recordEvent(
        {
          companyId,
          type: FinancialEventType.TAX_PAID,
          amount: taxAmount,
          description: `Provisão de imposto calculada via bCost Intelligence - Chave: ${invoice.accessKey}`,
          referenceId: invoice.id,
          referenceType: 'Invoice',
          occurredAt: new Date(),
          metadata: { taxType: 'ICMS', engine: 'v1' },
        },
        tx,
      );

      // 4. Atualização de Status
      // FIX: Usando um status válido do seu enum (Ex: PAID ou o que estiver no seu schema)
      // Se o seu status for diferente de 'PROCESSED', o TS avisará.
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          taxAmount: taxAmount,
          // Ajuste para um status que exista no seu enum, ex: 'SENT' ou 'PAID'
          status: invoice.status,
        },
      });

      this.logger.log(`✅ Cálculo fiscal finalizado: R$ ${taxAmount}`);
    });
  }
}
