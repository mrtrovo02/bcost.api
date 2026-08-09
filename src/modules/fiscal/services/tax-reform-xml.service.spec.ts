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
    expect(result.xml).toContain('<gCBS>');
    expect(result.xml).toContain('<vCBS>9.00</vCBS>');
    expect(result.xml).toContain('<gIBS>');
    expect(result.xml).toContain('<vIBS>1.00</vIBS>');
  });

  it('omite Imposto Seletivo quando o valor calculado for zero', () => {
    const result = service.buildGrupoUB({
      destination: { stateIbgeCode: '35' },
      items: [{ itemId: '1', baseAmount: 1000 }],
    });

    expect(result.xml).not.toContain('<gIS>');
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
