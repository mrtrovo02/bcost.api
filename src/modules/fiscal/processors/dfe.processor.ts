'use strict';

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';

type DfeProcessorJobData = {
  companyId: string;
  fileBuffer: string;
  type: 'NFE' | 'NFSE' | 'PRODUCT' | 'SERVICE';
};

type DfeProcessorResult = {
  id: string;
};

type DfeExtractedData = {
  issuedAt: Date;
  amount: Prisma.Decimal;
};

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
export class DfeProcessor extends WorkerHost {
  private readonly logger = new Logger(DfeProcessor.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(
    job: Job<DfeProcessorJobData, DfeProcessorResult, string>,
  ): Promise<DfeProcessorResult> {
    const { companyId, fileBuffer, type } = job.data;

    try {
      const xmlString = Buffer.from(fileBuffer).toString('utf-8');
      const jsonObj = this.parser.parse(xmlString);
      const extracted = this.mapXmlData(jsonObj);

      // Como o seu Schema NÃO tem 'accessKey' nem 'number',
      // vamos usar apenas os campos validados pelo seu erro de compilação.
      const invoice = await this.prisma.invoice.create({
        data: {
          amount: extracted.amount,
          issuedAt: extracted.issuedAt,
          type: type === 'NFE' ? InvoiceType.PRODUCT : InvoiceType.SERVICE,
          status: InvoiceStatus.NORMAL,
          reconciled: false,
          // Conexões usando os IDs que o seu tipo exige
          companyId: companyId,
          customerId: companyId, // Ajuste: usando companyId como customerId por falta de campo no XML/Schema
        },
      });

      // Removido log de invoice.number e invoice.accessKey pois NÃO existem no tipo
      this.logger.log(
        `[Worker] ✅ Nota ID ${invoice.id} processada com sucesso.`,
      );
      return { id: invoice.id };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Worker] ❌ Erro no processamento: ${message}`);
      throw error;
    }
  }

  private mapXmlData(jsonObj: unknown): DfeExtractedData {
    const infNFe =
      readNestedRecord(jsonObj, ['nfeProc', 'NFe', 'infNFe']) ||
      readNestedRecord(jsonObj, ['NFe', 'infNFe']);
    const dhEmi = readNestedValue(infNFe, ['ide', 'dhEmi']);
    const amount = readNestedValue(infNFe, ['total', 'ICMSTot', 'vNF']);

    return {
      issuedAt: typeof dhEmi === 'string' ? new Date(dhEmi) : new Date(),
      amount: new Prisma.Decimal(
        typeof amount === 'number' || typeof amount === 'string' ? amount : 0,
      ),
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`[Job Failed] ID: ${job.id} - ${error.message}`);
  }
}
