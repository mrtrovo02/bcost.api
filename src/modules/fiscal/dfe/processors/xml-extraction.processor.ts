'use strict';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../../database/prisma.service.js';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';

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
    const startTime = Date.now();
    // Nota: Removi accessKey do destructuring pois ele não existe no modelo Invoice do seu banco
    const { companyId, fileBuffer, type, userId } = job.data;

    this.logger.log(
      `[Worker] Processando Ingestão de XML para Empresa: ${companyId}`,
    );

    try {
      // O buffer geralmente vem como base64 de filas BullMQ
      const xmlString = Buffer.from(fileBuffer, 'base64').toString('utf-8');
      const jsonObj = this.parser.parse(xmlString);
      const extractedData = this.parseNfeData(jsonObj);

      if (!extractedData) {
        throw new Error(
          'Falha crítica: Estrutura infNFe não localizada no XML.',
        );
      }

      /**
       * CORREÇÃO DE TIPAGEM:
       * 1. Usamos 'create' pois seu Schema não tem 'accessKey' @unique para fazer upsert.
       * 2. 'issueDate' virou 'issuedAt'.
       * 3. 'totalValue' virou 'amount'.
       * 4. 'customerId' é obrigatório (estamos vinculando à própria empresa como fallback).
       */
      const result = await this.prisma.invoice.create({
        data: {
          amount: new Prisma.Decimal(extractedData.amount),
          issuedAt: extractedData.issuedAt,
          type: type === 'NFSE' ? InvoiceType.SERVICE : InvoiceType.PRODUCT,
          status: extractedData.status,
          reconciled: false,
          // Relacionamentos obrigatórios conforme seu Schema
          company: { connect: { id: companyId } },
          customer: { connect: { id: companyId } },
        },
      });

      /**
       * AUDIT LOG ENTERPRISE:
       * Payload corrigido para não tentar acessar campos inexistentes no modelo Invoice
       */
      await this.prisma.auditLog.create({
        data: {
          userId: userId || 'SYSTEM_ROBOT',
          companyId,
          action: 'PROCESS_XML_INTEGRATION',
          module: 'FISCAL',
          entity: 'Invoice',
          entityId: result.id,
          payload: {
            number: extractedData.number,
            jobId: job.id,
            amount: extractedData.amount,
          } as unknown as Prisma.InputJsonValue,
          responseTime: Date.now() - startTime,
          statusCode: 201,
        },
      });

      this.logger.log(
        `[Worker] Sucesso: NF ${extractedData.number} integrada via ID ${result.id}.`,
      );
      return { invoiceId: result.id, status: 'PROCESSED' };
    } catch (error: any) {
      this.logger.error(
        `[Worker Error] Falha no processamento: ${error.message}`,
      );
      throw error;
    }
  }

  private parseNfeData(jsonObj: any) {
    try {
      const nfe = jsonObj.nfeProc?.NFe?.infNFe || jsonObj.NFe?.infNFe;

      if (!nfe) return null;

      return {
        // Campos de extração do XML (independente do banco)
        number: String(nfe.ide.nNF),
        issuedAt: new Date(nfe.ide.dhEmi),
        amount: Number(nfe.total.ICMSTot.vNF),
        status: InvoiceStatus.NORMAL,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `[Parser Error] Erro ao navegar no JSON do XML: ${message}`,
      );
      return null;
    }
  }
}
