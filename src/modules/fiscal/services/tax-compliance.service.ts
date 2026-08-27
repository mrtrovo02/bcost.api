'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FinancialLedgerService } from '../../financial/services/financial-ledger.service.js';
import { FinancialEventType, Prisma } from '@prisma/client';

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
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, companyId },
      });

      if (!invoice)
        throw new BadRequestException('Nota fiscal não encontrada.');

      const taxAmount = invoice.taxAmount ? Number(invoice.taxAmount) : 0;

      if (taxAmount <= 0) {
        this.logger.warn(
          `Nota ${invoiceId} sem imposto informado. Provisao automatica pulada ate haver parametrizacao fiscal por UF/CST/CNAE.`,
        );

        return {
          status: 'skipped',
          reason: 'missing_tax_amount',
          message:
            'Imposto nao provisionado automaticamente sem valor fiscal extraido/informado.',
        };
      }

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
          metadata: {
            taxType: 'INVOICE_TAX_AMOUNT',
            engine: 'invoice-extracted',
          },
        },
        tx,
      );

      // 4. Atualização de Status
      // FIX: Usando um status válido do seu enum (Ex: PAID ou o que estiver no seu schema)
      // Se o seu status for diferente de 'PROCESSED', o TS avisará.
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          taxAmount,
          status: invoice.status,
        },
      });

      this.logger.log(`✅ Cálculo fiscal finalizado: R$ ${taxAmount}`);
    });
  }
}
