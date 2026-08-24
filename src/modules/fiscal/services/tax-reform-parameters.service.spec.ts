import { TaxJurisdictionScope, TaxReformTaxType } from '@prisma/client';
import { CbsIbsEngineService } from './cbs-ibs-engine.service.js';
import { TaxReformParametersService } from './tax-reform-parameters.service.js';

describe('TaxReformParametersService', () => {
  const createService = (overrides?: {
    classifications?: any[];
    destinationRules?: any[];
    rates?: any[];
  }) => {
    const prisma = {
      taxClassification: {
        findMany: jest.fn().mockResolvedValue(overrides?.classifications ?? []),
      },
      taxDestinationRule: {
        findMany: jest
          .fn()
          .mockResolvedValue(overrides?.destinationRules ?? []),
      },
      taxReformRate: {
        findMany: jest.fn().mockResolvedValue(overrides?.rates ?? []),
      },
    };

    return {
      prisma,
      service: new TaxReformParametersService(
        prisma as any,
        new CbsIbsEngineService(),
      ),
    };
  };

  it('usa as alíquotas transitórias quando não há parametrização persistida', async () => {
    const { service } = createService();

    const result = await service.resolveParameters({
      destinationStateIbge: '35',
    });

    expect(result.fallbackApplied).toBe(true);
    expect(result.rates).toEqual({ CBS: 0.009, IBS: 0.001, IS: 0 });
    expect(result.governance).toMatchObject({
      officialRatesLoaded: false,
      requiresOfficialTableReview: true,
    });
    expect(result.governance.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Alíquotas transitórias 2026 aplicadas por fallback'),
        expect.stringContaining('Destino fiscal informado sem regra de destino vigente'),
      ]),
    );
  });

  it('prioriza alíquota específica da empresa sobre parametrização global', async () => {
    const validFrom = new Date('2026-01-01T00:00:00.000Z');
    const { service } = createService({
      rates: [
        {
          companyId: null,
          taxType: TaxReformTaxType.CBS,
          scope: TaxJurisdictionScope.FEDERAL,
          jurisdictionCode: null,
          rate: 0.009,
          validFrom,
          validTo: null,
        },
        {
          companyId: 'company-1',
          taxType: TaxReformTaxType.CBS,
          scope: TaxJurisdictionScope.FEDERAL,
          jurisdictionCode: null,
          rate: 0.007,
          validFrom,
          validTo: null,
        },
      ],
    });

    const result = await service.resolveParameters({
      companyId: 'company-1',
      operationDate: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(result.rates.CBS).toBe(0.007);
    expect(result.governance.officialRatesLoaded).toBe(true);
  });

  it('aplica regra de destino que desativa IBS e IS', async () => {
    const { service } = createService({
      destinationRules: [
        {
          destinationStateIbge: '35',
          destinationMunicipalityIbge: null,
          appliesIbs: false,
          appliesCbs: true,
          appliesSelectiveTax: false,
          priority: 1,
          sourceVersion: 'NT_2025_002',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: null,
        },
      ],
      rates: [
        {
          companyId: null,
          taxType: TaxReformTaxType.IBS,
          scope: TaxJurisdictionScope.STATE,
          jurisdictionCode: '35',
          rate: 0.001,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: null,
        },
      ],
    });

    const result = await service.resolveParameters({
      destinationStateIbge: '35',
      operationDate: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(result.rates.IBS).toBe(0);
    expect(result.rates.IS).toBe(0);
  });

  it('calcula usando classificação vigente, redutor e alíquota zero', async () => {
    const { service } = createService({
      classifications: [
        {
          cstCode: '400',
          cClassTribCode: '100001',
          description: 'Cesta básica nacional',
          taxType: TaxReformTaxType.CBS,
          isZeroRate: true,
          reductionRate: 0,
          creditAllowed: true,
          legalBasis: 'Tabela cClassTrib vigente',
          sourceVersion: 'NT_2025_002',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: null,
        },
      ],
    });

    const result = await service.calculateWithResolvedParameters({
      destinationStateIbge: '35',
      cstCode: '400',
      cClassTribCode: '100001',
      operationDate: new Date('2026-06-01T00:00:00.000Z'),
      items: [{ itemId: '1', baseAmount: 1000 }],
    });

    expect(result.parameters.classification?.isZeroRate).toBe(true);
    expect(result.parameters.governance.classificationLoaded).toBe(true);
    expect(result.parameters.governance.requiresOfficialTableReview).toBe(true);
    expect(result.calculation.totals.grossTax).toBe(0);
  });

  it('marca revisão oficial quando CST/cClassTrib não possuem classificação vigente', async () => {
    const { service } = createService({
      rates: [
        {
          companyId: null,
          taxType: TaxReformTaxType.CBS,
          scope: TaxJurisdictionScope.FEDERAL,
          jurisdictionCode: null,
          rate: 0.009,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validTo: null,
        },
      ],
    });

    const result = await service.resolveParameters({
      cstCode: '000',
      cClassTribCode: '000001',
      operationDate: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(result.fallbackApplied).toBe(false);
    expect(result.governance).toMatchObject({
      officialRatesLoaded: true,
      classificationLoaded: false,
      requiresOfficialTableReview: true,
    });
    expect(result.governance.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CST/cClassTrib informado sem classificação oficial vigente'),
      ]),
    );
  });
});
