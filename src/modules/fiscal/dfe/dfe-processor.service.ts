'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  InvoiceStatus,
  InvoiceType,
  NFeStatus,
  SefazEvent,
} from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { SefazProtocolService } from './sefaz-protocol.service.js';
import { XmlService } from '../xml/xml.service.js';
import { InvoiceService } from '../invoices/invoice.service.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class DfeProcessorService {
  private readonly logger = new Logger(DfeProcessorService.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly sefazProtocol: SefazProtocolService,
    private readonly xmlService: XmlService,
    private readonly invoiceService: InvoiceService,
  ) {}

  /**
   * Processa XML de documento fiscal e persiste os campos canônicos da
   * Reforma Tributária extraídos pelo XmlService.
   */
  async processXml(companyId: string, xmlContent: string) {
    this.logger.log(
      `[DfeProcessor] Processando nota para Empresa: ${companyId}`,
    );

    try {
      const jsonObj = this.xmlParser.parse(xmlContent);
      const extractedData = this.xmlService.parseInvoiceXml(xmlContent);
      const authorization = this.resolveAuthorization(jsonObj);

      const invoice = await this.invoiceService.create({
        companyId,
        number: extractedData.number,
        accessKey: extractedData.accessKey,
        issueDate: extractedData.issuedAt.toISOString(),
        totalValue: extractedData.amount,
        taxableValue: extractedData.taxableValue,
        type:
          extractedData.type === 'PRODUCT'
            ? InvoiceType.PRODUCT
            : InvoiceType.SERVICE,
        status: authorization.invoiceStatus,
        nfeStatus: authorization.nfeStatus,
        finNFe: extractedData.finNFe,
        issuePurpose: extractedData.issuePurpose,
        cstCode: extractedData.cstCode,
        cClassTribCode: extractedData.cClassTribCode,
        destinationStateIbge: extractedData.destinationStateIbge,
        destinationMunicipalityIbge: extractedData.destinationMunicipalityIbge,
        hasLegacyTaxes: extractedData.hasLegacyTaxes,
        taxReformPayload: extractedData.taxReformPayload,
        customerDocument: extractedData.customerDocument,
        customerName: extractedData.customerName,
        rawJson: {
          retentions: extractedData.retentions,
          taxReformPayload: extractedData.taxReformPayload,
          rawJson: extractedData.rawJson || {},
        },
      });

      if (authorization.protocol) {
        await this.prisma.invoiceSefazEvent.create({
          data: {
            invoiceId: invoice.id,
            event: authorization.sefazEvent,
            protocol: authorization.protocol.protocol,
            protocolLength: authorization.protocol.protocolLength,
            statusCode: authorization.protocol.statusCode,
            message: authorization.protocol.message,
          },
        });
      }

      return invoice;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`[DfeProcessor Critical] Falha: ${message}`);
      throw new BadRequestException(`Erro no processamento do XML: ${message}`);
    }
  }

  private resolveAuthorization(jsonObj: unknown): {
    invoiceStatus: InvoiceStatus;
    nfeStatus: NFeStatus;
    sefazEvent: SefazEvent;
    protocol?: ReturnType<SefazProtocolService['parseAuthorizationReturn']>;
  } {
    try {
      const protocol = this.sefazProtocol.parseAuthorizationReturn(jsonObj);
      const statusCode = protocol.statusCode;

      if (['101', '135', '155'].includes(String(statusCode))) {
        return {
          invoiceStatus: InvoiceStatus.CANCELLED,
          nfeStatus: NFeStatus.CANCELLED,
          sefazEvent: SefazEvent.CANCELADA,
          protocol,
        };
      }

      if (String(statusCode) === '100') {
        return {
          invoiceStatus: InvoiceStatus.NORMAL,
          nfeStatus: NFeStatus.AUTHORIZED,
          sefazEvent: SefazEvent.AUTORIZADA,
          protocol,
        };
      }

      return {
        invoiceStatus: InvoiceStatus.NORMAL,
        nfeStatus: NFeStatus.DENIED,
        sefazEvent: SefazEvent.DENEGADA,
        protocol,
      };
    } catch {
      return {
        invoiceStatus: InvoiceStatus.NORMAL,
        nfeStatus: NFeStatus.DRAFT,
        sefazEvent: SefazEvent.AUTORIZADA,
      };
    }
  }
}
