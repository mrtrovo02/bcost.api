import { CbsIbsEngineService } from './cbs-ibs-engine.service.js';

describe('CbsIbsEngineService', () => {
  let service: CbsIbsEngineService;

  beforeEach(() => {
    service = new CbsIbsEngineService();
  });

  it('calcula CBS, IBS e estimativa de split payment para a fase de teste', () => {
    expect(service.calculateTransitionalTax(100000)).toEqual({
      revenue: 100000,
      cbsValue: 900,
      ibsValue: 100,
      totalTransitionalTax: 1000,
      netRevenue: 99000,
      splitPaymentEstimate: {
        retentionAtSource: 1000,
        effectiveNetCashflow: 99000,
      },
    });
  });

  it('calcula o Grupo UB com destino fiscal, créditos e net tax', () => {
    const result = service.calculateReform2026({
      destination: {
        stateIbgeCode: '35',
        municipalityIbgeCode: '3550308',
      },
      items: [
        {
          itemId: 'item-1',
          baseAmount: 100000,
          cstCode: '000',
          cClassTribCode: '000001',
        },
      ],
      credits: [{ taxType: 'CBS', amount: 250, documentKey: 'entrada-1' }],
    });

    expect(result.xmlGroup).toBe('UB');
    expect(result.xmlSchema).toBe('DFeTiposBasicos_v1.00.xsd');
    expect(result.totals).toMatchObject({
      baseAmount: 100000,
      taxableBaseAmount: 100000,
      cbsValue: 900,
      ibsValue: 100,
      grossTax: 1000,
      creditsApplied: 250,
      netTax: 750,
    });
  });

  it('aplica alíquota zero para item marcado como Cesta Básica Nacional', () => {
    const result = service.calculateReform2026({
      destination: { stateIbgeCode: '35' },
      items: [
        {
          itemId: 'basic-basket',
          baseAmount: 500,
          isNationalBasicBasket: true,
          cstCode: '400',
          cClassTribCode: '100001',
        },
      ],
    });

    expect(result.items[0].applied.zeroRate).toBe(true);
    expect(result.items[0].taxableBaseAmount).toBe(0);
    expect(result.totals.taxableBaseAmount).toBe(0);
    expect(result.totals.grossTax).toBe(0);
  });

  it('aplica redução de base antes de calcular CBS/IBS/IS', () => {
    const result = service.calculateReform2026({
      destination: { stateIbgeCode: '35' },
      rates: { IS: 0.02 },
      items: [
        {
          itemId: 'reduced-item',
          baseAmount: 1000,
          reductionRate: 0.4,
        },
      ],
    });

    expect(result.items[0]).toMatchObject({
      baseAmount: 1000,
      taxableBaseAmount: 600,
      cbsValue: 5.4,
      ibsValue: 0.6,
      selectiveTaxValue: 12,
      total: 18,
    });
    expect(result.totals).toMatchObject({
      baseAmount: 1000,
      taxableBaseAmount: 600,
      grossTax: 18,
    });
  });

  it('bloqueia impostos legados em Nota de Crédito/Débito', () => {
    expect(() =>
      service.calculateReform2026({
        issuePurpose: 'CREDIT_NOTE',
        destination: { stateIbgeCode: '35' },
        items: [
          {
            itemId: 'credit-note-item',
            baseAmount: 100,
            legacyTaxAmount: 18,
          },
        ],
      }),
    ).toThrow('Notas de débito/crédito');
  });
});
