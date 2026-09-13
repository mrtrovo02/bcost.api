'use strict';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../../database/prisma.service.js';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';

type XmlExtractionJobData = {
  companyId: string;
  fileBuffer: string;
  type: 'NFSE' | 'NFE' | 'PRODUCT' | 'SERVICE';
  userId?: string;
};

type XmlExtractionResult = {
  invoiceId: string;
  status: 'PROCESSED';
};

type ParsedNfeData = {
  number: string;
  issuedAt: Date;
  amount: number;
  status: InvoiceStatus;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readNestedRecord(
  value: unknown,
  path: readonly string[],
): Record<string, unknown> | null {
  let current: unknown = value;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current && typeof current === 'object'
    ? (current as Record<string, unknown>)
    : null;
}

function readNestedValue(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

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

  async process(
    job: Job<XmlExtractionJobData, XmlExtractionResult, string>,
  ): Promise<XmlExtractionResult> {
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
    } catch (error: unknown) {
      this.logger.error(
        `[Worker Error] Falha no processamento: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private parseNfeData(jsonObj: unknown): ParsedNfeData | null {
    try {
      const nfe =
        readNestedRecord(jsonObj, ['nfeProc', 'NFe', 'infNFe']) ??
        readNestedRecord(jsonObj, ['NFe', 'infNFe']);

      if (!nfe) return null;

      const number = readNestedValue(nfe, ['ide', 'nNF']);
      const issuedAt = readNestedValue(nfe, ['ide', 'dhEmi']);
      const amount = readNestedValue(nfe, ['total', 'ICMSTot', 'vNF']);

      return {
        // Campos de extração do XML (independente do banco)
        number: String(number ?? ''),
        issuedAt: new Date(String(issuedAt ?? new Date().toISOString())),
        amount: Number(amount ?? 0),
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
