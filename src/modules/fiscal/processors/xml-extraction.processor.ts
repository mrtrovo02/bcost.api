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

type XmlExtractionJobData = {
  companyId: string;
  xmlContent?: string;
  fileBuffer?: string;
  accessKey?: string;
  type: 'NFSE' | 'NFE' | 'PRODUCT' | 'SERVICE';
};

type XmlExtractionResult = {
  id: string;
  accessKey: string;
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

function coerceDecimalInput(value: unknown): Prisma.Decimal.Value {
  return typeof value === 'number' || typeof value === 'string' ? value : 0;
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
    const { companyId, xmlContent, fileBuffer, accessKey, type } = job.data;

    try {
      const rawXml = fileBuffer
        ? Buffer.from(fileBuffer, 'base64').toString('utf-8')
        : xmlContent;

      if (!rawXml) {
        throw new Error('Conteúdo XML ausente no job de extração.');
      }

      const jsonObj = this.parser.parse(rawXml);

      // Navegação no Schema NFe (Layout 4.00)
      const nfe =
        readNestedRecord(jsonObj, ['nfeProc', 'NFe']) ||
        readNestedRecord(jsonObj, ['NFe']);
      const infNFe = readNestedRecord(nfe, ['infNFe']);

      if (!infNFe && !accessKey) {
        throw new Error('XML não contém estrutura infNFe válida.');
      }

      const totalVNF = coerceDecimalInput(
        readNestedValue(infNFe, ['total', 'ICMSTot', 'vNF']),
      );
      const rawAccessKey = readNestedValue(infNFe, ['@_Id']);
      const chave =
        accessKey ||
        (typeof rawAccessKey === 'string'
          ? rawAccessKey.replace('NFe', '')
          : undefined);

      if (!chave) {
        throw new Error('XML não possui chave de acesso identificável.');
      }

      // 1. Localizar ou Criar Cliente (Customer) com base no XML
      // No bCost, se a nota é emitida PELA empresa, o destinatário é o Customer.
      const dest = readNestedRecord(infNFe, ['dest']);
      const customerDocumentValue =
        readNestedValue(dest, ['CNPJ']) || readNestedValue(dest, ['CPF']);
      const customerDocument =
        typeof customerDocumentValue === 'string' &&
        customerDocumentValue.trim()
          ? customerDocumentValue.trim()
          : '00000000000';
      const customerNameValue = readNestedValue(dest, ['xNome']);
      const customerName =
        typeof customerNameValue === 'string' && customerNameValue.trim()
          ? customerNameValue.trim()
          : 'Cliente Identificado via XML';
      const customer = await this.prisma.customer.upsert({
        where: {
          companyId_document: {
            companyId,
            document: customerDocument,
          },
        },
        update: { name: customerName },
        create: {
          companyId,
          document: customerDocument,
          name: customerName,
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
          taxAmount: new Prisma.Decimal(totalVNF).mul(0.06), // Alíquota padrão bCost
          issuedAt:
            typeof readNestedValue(infNFe, ['ide', 'dhEmi']) === 'string'
              ? new Date(readNestedValue(infNFe, ['ide', 'dhEmi']) as string)
              : new Date(),
          accessKey: chave,
          reconciled: false, // Pronto para o motor de conciliação
        },
      });

      this.logger.log(`✅ Nota ${chave} processada para Empresa ${companyId}`);
      return { id: invoice.id, accessKey: chave };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`❌ Falha no processamento: ${message}`);

      // Registrar falha na tabela de Notificações conforme seu Schema
      await this.prisma.notificationLog.create({
        data: {
          companyId,
          type: NotificationType.COMPLIANCE_ISSUE,
          title: 'Erro no Processamento de XML',
          message: `A nota ${accessKey || 'S/N'} falhou ao ser importada: ${message}`,
          severity: NotificationSeverity.WARNING,
          status: 'PENDING',
        },
      });

      throw error;
    }
  }
}
