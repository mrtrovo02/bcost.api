'use strict';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { XmlService, NormalizedInvoiceData } from '../xml/xml.service.js';
import { InvoiceService } from '../invoices/invoice.service.js';
import { XmlDocumentType } from '../dto/upload-xml.dto.js';
import { InvoiceType, InvoiceStatus } from '@prisma/client'; // Importação do InvoiceStatus necessária

/**
 * Interface de dados recebidos pela fila BullMQ
 */
interface XmlJobData {
  xmlContent: string;
  companyId: string;
  type: XmlDocumentType;
  originalName: string;
}

@Processor('xml-extraction')
export class XmlProcessor extends WorkerHost {
  private readonly logger = new Logger(XmlProcessor.name);

  constructor(
    private readonly xmlService: XmlService,
    private readonly invoiceService: InvoiceService,
  ) {
    super();
  }

  /**
   * Processamento assíncrono do job de extração de XML.
   * CORREÇÃO: Uso de Enums do Prisma (InvoiceStatus) para evitar erro de atribuição.
   */
  async process(job: Job<XmlJobData, any, string>): Promise<any> {
    const { xmlContent, companyId, originalName } = job.data;

    this.logger.log(
      `[Job ${job.id}] 🚀 Iniciando processamento técnico: ${originalName}`,
    );

    try {
      const buffer = Buffer.from(xmlContent, 'utf-8');
      const extractedData: NormalizedInvoiceData =
        this.xmlService.parseInvoiceXml(buffer);

      // 3. Montagem do objeto de persistência seguindo RIGOROSAMENTE o CreateInvoiceDto
      const invoiceData = {
        companyId: companyId,
        amount: extractedData.amount,
        issuedAt: extractedData.issuedAt,

        // Mapeamento de ENUMs (Garante que não sejam tratados como strings puras)
        type:
          extractedData.type === 'PRODUCT'
            ? InvoiceType.PRODUCT
            : InvoiceType.SERVICE,
        status: InvoiceStatus.NORMAL, // FIX: Usando o Enum em vez da string 'NORMAL'

        customerDocument: extractedData.customerDocument,
        customerName: extractedData.customerName,

        // Campos opcionais tratados para evitar erro de tipagem
        number: extractedData.number,
        accessKey: extractedData.accessKey,
        reconciled: false,

        metadata: {
          retentions: extractedData.retentions,
          rawJson: extractedData.rawJson || {},
        },
      };

      // 4. Persistência via Service
      const invoice = await this.invoiceService.create(invoiceData);

      this.logger.log(
        `[Job ${job.id}] ✅ Sucesso: Nota integrada com ID ${invoice.id}.`,
      );

      return {
        success: true,
        invoiceId: invoice.id,
      };
    } catch (error: any) {
      this.logger.error(`[Job ${job.id}] ❌ Falha Crítica: ${error.message}`);
      throw new Error(
        `Falha no processamento do XML ${originalName}: ${error.message}`,
      );
    }
  }
}
