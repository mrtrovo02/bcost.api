import { BadRequestException } from '@nestjs/common';
import { FiscalCompatibilityController } from './fiscal-compatibility.controller.js';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service.js';

describe('FiscalCompatibilityController', () => {
  const service = {
    calculateTransitionalTax: jest.fn(),
  } as unknown as CbsIbsEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the frontend tax data contract with CBS/IBS audit metadata', async () => {
    jest.spyOn(service, 'calculateTransitionalTax').mockReturnValueOnce({
      revenue: 100000,
      cbsValue: 900,
      ibsValue: 100,
      totalTransitionalTax: 1000,
      collectionDispensedIn2026: true,
      netRevenue: 100000,
      splitPaymentEstimate: {
        retentionAtSource: 0,
        effectiveNetCashflow: 100000,
      },
    });

    const controller = new FiscalCompatibilityController(service);
    const response = await controller.getTaxData(
      'company-001',
      undefined,
      '100000',
    );

    expect(response).toMatchObject({
      success: true,
      companyId: 'company-001',
      totalRevenue: 100000,
      estimatedTax: 1000,
      netRevenue: 100000,
      fatorR: 'N/A',
      totalInvoices: 0,
      taxEfficiency: 'Destaque CBS/IBS 2026: 1.00%',
      cbsRate: 0.009,
      ibsRate: 0.001,
      transitionalTaxActive: true,
      effectiveDate: '2026-01-01',
      collectionDispensedIn2026: true,
    });
  });

  it('rejects invalid revenue values', async () => {
    const controller = new FiscalCompatibilityController(service);

    await expect(
      controller.getTaxData('company-001', undefined, 'valor-invalido'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
