'use strict';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../../database/prisma.service.js';
import { XMLParser } from 'fast-xml-parser';
import { Prisma, InvoiceStatus, InvoiceType } from '@prisma/client';

@Processor('xml-extraction')
export class XmlProcessorConsumer extends WorkerHost {
  private readonly logger = new Logger(XmlProcessorConsumer.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { companyId, fileBuffer, type } = job.data;
    this.logger.log(
      `[XML-Worker] Processando ${type} para empresa: ${companyId}`,
    );

    try {
      const xmlString = Buffer.from(fileBuffer).toString('utf-8');
      const jsonObj = this.parser.parse(xmlString);

      // Normalização da extração (NFe v4.00 padrão SEFAZ)
      const nfeData = jsonObj.nfeProc?.NFe?.infNFe || jsonObj.infNFe;

      if (!nfeData && type === 'PRODUCT') {
        throw new Error(
          `Estrutura XML de NF-e inválida para a empresa: ${companyId}`,
        );
      }

      // Busca dados da empresa para regras tributárias
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { anexo: true, taxRegime: true },
      });

      // Instanciação segura de valores decimais usando Prisma.Decimal
      const amount = new Prisma.Decimal(nfeData?.total?.ICMSTot?.vNF || 0);
      const taxRate = this.calculateTaxRate(company?.anexo || 3);
      const estimatedTax = amount.mul(taxRate).div(100);

      // Persistência em Transação Atômica
      // NOTA: Como não há accessKey no Schema, usamos create.
      const result = await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            amount: amount,
            issuedAt: new Date(nfeData?.ide?.dhEmi || new Date()),
            type:
              type === 'PRODUCT' ? InvoiceType.PRODUCT : InvoiceType.SERVICE,
            status: InvoiceStatus.NORMAL,
            reconciled: false,
            // Relacionamentos obrigatórios
            company: { connect: { id: companyId } },
            customer: { connect: { id: companyId } }, // Fallback: conecta ao próprio ID da empresa
          },
        });

        // Registro de Auditoria (Ajustado para o seu Schema: module, payload, action)
        await tx.auditLog.create({
          data: {
            action: 'XML_PROCESSED',
            module: 'FISCAL',
            entity: 'Invoice',
            entityId: invoice.id,
            userId: '00000000-0000-0000-0000-000000000000', // Mock de sistema
            companyId,
            payload: {
              totalValue: amount.toNumber(),
              taxRate,
              estimatedTax: estimatedTax.toNumber(),
              xmlParsed: true,
            } as any,
          },
        });

        return invoice;
      });

      return { success: true, invoiceId: result.id };
    } catch (error: any) {
      this.logger.error(`[XML-Worker] Erro crítico: ${error.message}`);
      throw error;
    }
  }

  private calculateTaxRate(anexo: number): number {
    const rates: Record<number, number> = {
      1: 4.0,
      2: 4.5,
      3: 6.0,
      4: 4.5,
      5: 15.5,
    };
    return rates[anexo] || 6.0;
  }
}
