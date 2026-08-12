import {
  InvoiceStatus,
  InvoiceType,
  NFeStatus,
  SefazEvent,
} from '@prisma/client';
import { DfeProcessorService } from './dfe-processor.service.js';
import { SefazProtocolService } from './sefaz-protocol.service.js';

describe('DfeProcessorService', () => {
  const prisma = {
    invoiceSefazEvent: {
      create: jest.fn(),
    },
  };
  const xmlService = {
    parseInvoiceXml: jest.fn(),
  };
  const invoiceService = {
    create: jest.fn(),
  };

  let service: DfeProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DfeProcessorService(
      prisma as never,
      new SefazProtocolService(),
      xmlService as never,
      invoiceService as never,
    );
  });

  it('persiste campos da Reforma Tributária e registra protocolo SEFAZ', async () => {
    xmlService.parseInvoiceXml.mockReturnValue({
      number: '123',
      accessKey: '35260100000000000000550010000000011000000010',
      issuedAt: new Date('2026-01-10T13:00:00.000Z'),
      amount: 1000,
      taxableValue: 1000,
      type: 'PRODUCT',
      finNFe: '6',
      issuePurpose: 'CREDIT_NOTE',
      cstCode: '000',
      cClassTribCode: '000001',
      destinationStateIbge: '35',
      destinationMunicipalityIbge: '3550308',
      hasLegacyTaxes: false,
      taxReformPayload: {
        group: 'UB',
        cbsValue: 9,
        ibsValue: 1,
        selectiveTaxValue: 0,
        raw: {},
      },
      customerDocument: '11222333000144',
      customerName: 'Cliente Reforma',
      retentions: { iss: 0, irrf: 0, pis: 0, cofins: 0, csll: 0 },
      rawJson: {},
    });
    invoiceService.create.mockResolvedValue({ id: 'invoice-1' });
    prisma.invoiceSefazEvent.create.mockResolvedValue({ id: 'event-1' });

    const xml = `
      <nfeProc>
        <NFe><infNFe><ide><nNF>123</nNF></ide></infNFe></NFe>
        <protNFe>
          <infProt>
            <nProt>12345678901234567</nProt>
            <cStat>100</cStat>
            <xMotivo>Autorizado o uso da NF-e</xMotivo>
          </infProt>
        </protNFe>
      </nfeProc>
    `;

    await expect(service.processXml('company-1', xml)).resolves.toEqual({
      id: 'invoice-1',
    });

    expect(invoiceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        number: '123',
        accessKey: '35260100000000000000550010000000011000000010',
        totalValue: 1000,
        taxableValue: 1000,
        type: InvoiceType.PRODUCT,
        status: InvoiceStatus.NORMAL,
        nfeStatus: NFeStatus.AUTHORIZED,
        finNFe: '6',
        issuePurpose: 'CREDIT_NOTE',
        cstCode: '000',
        cClassTribCode: '000001',
        destinationStateIbge: '35',
        destinationMunicipalityIbge: '3550308',
        hasLegacyTaxes: false,
        taxReformPayload: expect.objectContaining({
          group: 'UB',
          cbsValue: 9,
          ibsValue: 1,
        }),
      }),
    );
    expect(prisma.invoiceSefazEvent.create).toHaveBeenCalledWith({
      data: {
        invoiceId: 'invoice-1',
        event: SefazEvent.AUTORIZADA,
        protocol: '12345678901234567',
        protocolLength: 17,
        statusCode: '100',
        message: 'Autorizado o uso da NF-e',
      },
    });
  });

  it('processa documento sem protocolo sem criar evento SEFAZ', async () => {
    xmlService.parseInvoiceXml.mockReturnValue({
      number: 'NFSE-1',
      accessKey: 'NFSE-1-00000000000000',
      issuedAt: new Date('2026-01-10T13:00:00.000Z'),
      amount: 500,
      taxableValue: 500,
      type: 'SERVICE',
      customerDocument: '11222333000144',
      customerName: 'Cliente Serviço',
      retentions: { iss: 0, irrf: 0, pis: 0, cofins: 0, csll: 0 },
      rawJson: {},
    });
    invoiceService.create.mockResolvedValue({ id: 'invoice-2' });

    await service.processXml('company-1', '<Nfse><InfNfse /></Nfse>');

    expect(invoiceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: InvoiceType.SERVICE,
        status: InvoiceStatus.NORMAL,
        nfeStatus: NFeStatus.DRAFT,
      }),
    );
    expect(prisma.invoiceSefazEvent.create).not.toHaveBeenCalled();
  });
});
