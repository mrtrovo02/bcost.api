'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { InvoiceType, InvoiceStatus, Prisma, SefazEvent } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { SefazProtocolService } from './sefaz-protocol.service.js';

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
  ) {}

  /**
   * Processa um XML de nota fiscal (NF-e ou NFS-e).
   * Ajustado para o Schema Real: Usa create (sem accessKey unique) e campos simplificados.
   */
  async processXml(companyId: string, xmlContent: string) {
    this.logger.log(
      `[DfeProcessor] Processando nota para Empresa: ${companyId}`,
    );

    try {
      const jsonObj = this.xmlParser.parse(xmlContent);
      const isProduct = !!jsonObj?.nfeProc || !!jsonObj?.NFe;

      const extractedData = isProduct
        ? this.mapProductInvoice(jsonObj)
        : this.mapServiceInvoice(jsonObj);

      /**
       * CORREÇÃO TÉCNICA:
       * Como seu Schema não possui 'accessKey' como @unique, não podemos usar upsert.
       * Além disso, mapeamos 'totalValue' para 'amount' e 'issueDate' para 'issuedAt'.
       */
      const invoice = await this.prisma.invoice.create({
        data: {
          amount: extractedData.amount,
          issuedAt: extractedData.issuedAt,
          type: extractedData.type,
          status: extractedData.status,
          reconciled: false,

          // Relacionamentos obrigatórios
          company: { connect: { id: companyId } },
          customer: { connect: { id: companyId } }, // Fallback: associa à própria empresa para teste
        },
      });

      if (extractedData.protocol) {
        await this.prisma.invoiceSefazEvent.create({
          data: {
            invoiceId: invoice.id,
            event: extractedData.sefazEvent,
            protocol: extractedData.protocol.protocol,
            protocolLength: extractedData.protocol.protocolLength,
            statusCode: extractedData.protocol.statusCode,
            message: extractedData.protocol.message,
          },
        });
      }

      return invoice;
    } catch (error: any) {
      this.logger.error(`[DfeProcessor Critical] Falha: ${error.message}`);
      throw new BadRequestException(
        `Erro no processamento do XML: ${error.message}`,
      );
    }
  }

  /**
   * Mapeamento NF-e (Produtos)
   */
  private mapProductInvoice(json: any) {
    const nfe = json.nfeProc?.NFe || json.NFe;
    const infNFe = nfe?.infNFe;
    const protNFe = json.nfeProc?.protNFe;
    const cStat = protNFe?.infProt?.cStat;

    let status: InvoiceStatus = InvoiceStatus.NORMAL;
    if (['101', '135', '155'].includes(String(cStat))) {
      status = InvoiceStatus.CANCELLED;
    }

    return {
      issuedAt: new Date(infNFe?.ide?.dhEmi || new Date()),
      type: InvoiceType.PRODUCT,
      status: status,
      sefazEvent:
        String(cStat) === '100' ? SefazEvent.AUTORIZADA : SefazEvent.DENEGADA,
      protocol: protNFe?.infProt?.nProt
        ? this.sefazProtocol.parseAuthorizationReturn(json)
        : undefined,
      // Mapeia o total da nota para o campo 'amount' do Schema
      amount: new Prisma.Decimal(infNFe?.total?.ICMSTot?.vNF || 0),
    };
  }

  /**
   * Mapeamento NFS-e (Serviços)
   */
  private mapServiceInvoice(json: any) {
    const nfs = json.ComplNfse?.Nfse?.InfNfse || json.Nfse?.InfNfse || json;
    const valores = nfs.Valores || nfs.Servico?.Valores;

    let status: InvoiceStatus = InvoiceStatus.NORMAL;
    if (String(nfs.Status) === '2') {
      status = InvoiceStatus.CANCELLED;
    }

    return {
      issuedAt: new Date(nfs.DataEmissao || new Date()),
      type: InvoiceType.SERVICE,
      status: status,
      sefazEvent: SefazEvent.AUTORIZADA,
      protocol: undefined,
      // Mapeia o valor do serviço para o campo 'amount' do Schema
      amount: new Prisma.Decimal(valores?.ValorServicos || 0),
    };
  }
}
