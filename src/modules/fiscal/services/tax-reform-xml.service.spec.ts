import { BadRequestException } from '@nestjs/common';
import { CbsIbsEngineService } from './cbs-ibs-engine.service.js';
import { TaxReformXmlService } from './tax-reform-xml.service.js';

describe('TaxReformXmlService', () => {
  let service: TaxReformXmlService;

  beforeEach(() => {
    service = new TaxReformXmlService(new CbsIbsEngineService());
  });

  it('serializa dinamicamente o Grupo UB com CBS e IBS', () => {
    const result = service.buildGrupoUB({
      infNFeId: 'NFe35260100000000000000550010000000011000000010',
      destination: { stateIbgeCode: '35', municipalityIbgeCode: '3550308' },
      items: [
        {
          itemId: '1',
          baseAmount: 1000,
          cstCode: '000',
          cClassTribCode: '000001',
        },
      ],
    });

    expect(result.group).toBe('UB');
    expect(result.xml).toContain('<UB schema="DFeTiposBasicos_v1.00.xsd">');
    expect(result.xml).toContain('<det nItem="1">');
    expect(result.xml).toContain('<imposto>');
    expect(result.xml).toContain('<IBSCBS>');
    expect(result.xml).toContain('<gIBSCBS>');
    expect(result.xml).toContain('<vBC>1000.00</vBC>');
    expect(result.xml).toContain('<pIBSUF>0.1000</pIBSUF>');
    expect(result.xml).toContain('<vIBSUF>1.00</vIBSUF>');
    expect(result.xml).toContain('<pIBSMun>0.0000</pIBSMun>');
    expect(result.xml).toContain('<vIBSMun>0.00</vIBSMun>');
    expect(result.xml).toContain('<vIBS>1.00</vIBS>');
    expect(result.xml).toContain('<gCBS>');
    expect(result.xml).toContain('<pCBS>0.9000</pCBS>');
    expect(result.xml).toContain('<vCBS>9.00</vCBS>');
    expect(result.xml).toContain('<IBSCBSTot>');
    expect(result.xml).toContain('<vNFTribReforma>10.00</vNFTribReforma>');
  });

  it('omite Imposto Seletivo quando o valor calculado for zero', () => {
    const result = service.buildGrupoUB({
      destination: { stateIbgeCode: '35' },
      items: [{ itemId: '1', baseAmount: 1000 }],
    });

    expect(result.xml).not.toContain('<gIS>');
    expect(result.xml).not.toContain('<IS>');
  });

  it('serializa Imposto Seletivo quando houver valor calculado', () => {
    const result = service.buildGrupoUB({
      destination: { stateIbgeCode: '35', municipalityIbgeCode: '3550308' },
      rates: { IS: 0.02 },
      items: [
        {
          itemId: '1',
          baseAmount: 1000,
          cstCode: '000',
          cClassTribCode: '000001',
          selectiveTaxCstCode: '000',
          selectiveTaxClassCode: '000001',
        },
      ],
    });

    expect(result.xml).toContain('<IS>');
    expect(result.xml).toContain('<CSTIS>000</CSTIS>');
    expect(result.xml).toContain('<cClassTribIS>000001</cClassTribIS>');
    expect(result.xml).toContain('<vBCIS>1000.00</vBCIS>');
    expect(result.xml).toContain('<pIS>2.0000</pIS>');
    expect(result.xml).toContain('<vIS>20.00</vIS>');
  });

  it('bloqueia Nota de Crédito com impostos legados antes do envio', () => {
    expect(() =>
      service.buildGrupoUB({
        issuePurpose: 'CREDIT_NOTE',
        destination: { stateIbgeCode: '35' },
        items: [{ itemId: '1', baseAmount: 100, legacyTaxAmount: 18 }],
      }),
    ).toThrow(BadRequestException);
  });

  it('valida formato de CST e cClassTrib', () => {
    expect(() =>
      service.buildGrupoUB({
        destination: { stateIbgeCode: '35' },
        items: [{ itemId: '1', baseAmount: 100, cstCode: '00' }],
      }),
    ).toThrow(BadRequestException);
  });
});
