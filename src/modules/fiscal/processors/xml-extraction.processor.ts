'use strict';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  InvoiceStatus,
  InvoiceType,
  Prisma,
  NotificationSeverity,
  NotificationType,
} from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';

@Processor('xml-extraction')
export class XmlExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(XmlExtractionProcessor.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { companyId, xmlContent, fileBuffer, accessKey, type } = job.data;

    try {
      const rawXml = fileBuffer
        ? Buffer.from(fileBuffer, 'base64').toString('utf-8')
        : xmlContent;

      const jsonObj = this.parser.parse(rawXml);

      // Navegação no Schema NFe (Layout 4.00)
      const nfe = jsonObj?.nfeProc?.NFe || jsonObj?.NFe;
      const infNFe = nfe?.infNFe;

      if (!infNFe && !accessKey) {
        throw new Error('XML não contém estrutura infNFe válida.');
      }

      const totalVNF = infNFe?.total?.ICMSTot?.vNF || 0;
      const chave = accessKey || infNFe?.['@_Id']?.replace('NFe', '');

      // 1. Localizar ou Criar Cliente (Customer) com base no XML
      // No bCost, se a nota é emitida PELA empresa, o destinatário é o Customer.
      const dest = infNFe?.dest;
      const customer = await this.prisma.customer.upsert({
        where: {
          companyId_document: {
            companyId,
            document: dest?.CNPJ || dest?.CPF || '00000000000',
          },
        },
        update: { name: dest?.xNome || 'Cliente Identificado via XML' },
        create: {
          companyId,
          document: dest?.CNPJ || dest?.CPF || '00000000000',
          name: dest?.xNome || 'Cliente Importado',
          active: true,
        },
      });

      // 2. Upsert da Invoice seguindo seu Schema
      const invoice = await this.prisma.invoice.upsert({
        where: { accessKey: chave },
        update: {
          amount: new Prisma.Decimal(totalVNF),
          status: InvoiceStatus.NORMAL,
        },
        create: {
          companyId,
          customerId: customer.id,
          type: type === 'NFSE' ? InvoiceType.SERVICE : InvoiceType.PRODUCT,
          status: InvoiceStatus.NORMAL,
          amount: new Prisma.Decimal(totalVNF),
          taxAmount: new Prisma.Decimal(totalVNF * 0.06), // Alíquota padrão bCost
          issuedAt: infNFe?.ide?.dhEmi
            ? new Date(infNFe.ide.dhEmi)
            : new Date(),
          accessKey: chave,
          reconciled: false, // Pronto para o motor de conciliação
        },
      });

      this.logger.log(`✅ Nota ${chave} processada para Empresa ${companyId}`);
      return { id: invoice.id, accessKey: chave };
    } catch (error: any) {
      this.logger.error(`❌ Falha no processamento: ${error.message}`);

      // Registrar falha na tabela de Notificações conforme seu Schema
      await this.prisma.notificationLog.create({
        data: {
          companyId,
          type: NotificationType.COMPLIANCE_ISSUE,
          title: 'Erro no Processamento de XML',
          message: `A nota ${accessKey || 'S/N'} falhou ao ser importada: ${error.message}`,
          severity: NotificationSeverity.WARNING,
          status: 'PENDING',
        },
      });

      throw error;
    }
  }
}
