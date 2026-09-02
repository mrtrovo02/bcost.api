import { BadRequestException } from '@nestjs/common';
import { FiscalCompatibilityController } from './fiscal-compatibility.controller.js';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service.js';
import { FiscalService } from './fiscal.service.js';

describe('FiscalCompatibilityController', () => {
  const cbsIbsEngine = {
    calculateTransitionalTax: jest.fn(),
  } as unknown as CbsIbsEngineService;

  const fiscalService = {
    calculateMonthlyTax: jest.fn(),
  } as unknown as FiscalService;

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(fiscalService, 'calculateMonthlyTax').mockResolvedValue({
      metrics: {
        faturamentoMes: 100000,
        folhaMes: 30000,
        folha12: 360000,
        rbt12: 1200000,
        fatorR: 30,
        anexoUtilizado: 'III',
        aliqEfetiva: 12.03,
      },
      financial: {
        impostoAPagar: 12030,
        economiaFatorR: 0,
      },
      integrity: {
        count: 7,
        period: '2026-09',
      },
    });

    jest.spyOn(cbsIbsEngine, 'calculateTransitionalTax').mockReturnValue({
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
  });

  it('returns real monthly fiscal KPIs with CBS/IBS audit metadata', async () => {
    const controller = new FiscalCompatibilityController(
      cbsIbsEngine,
      fiscalService,
    );

    const response = await controller.getTaxData(
      'company-001',
      undefined,
      undefined,
      '9',
      '2026',
    );

    expect(fiscalService.calculateMonthlyTax).toHaveBeenCalledWith(
      'company-001',
      9,
      2026,
    );
    expect(cbsIbsEngine.calculateTransitionalTax).toHaveBeenCalledWith(100000);
    expect(response).toMatchObject({
      success: true,
      companyId: 'company-001',
      totalRevenue: 100000,
      estimatedTax: 12030,
      netRevenue: 87970,
      fatorR: '30.00%',
      totalInvoices: 7,
      taxEfficiency: 'Anexo III • Alíquota efetiva 12.03%',
      cbsRate: 0.009,
      ibsRate: 0.001,
      transitionalTaxActive: true,
      effectiveDate: '2026-01-01',
      collectionDispensedIn2026: true,
    });
  });

  it('uses an explicit revenue only for the CBS/IBS simulation base', async () => {
    const controller = new FiscalCompatibilityController(
      cbsIbsEngine,
      fiscalService,
    );

    await controller.getTaxData('company-001', undefined, '250000', '9', '2026');

    expect(cbsIbsEngine.calculateTransitionalTax).toHaveBeenCalledWith(250000);
  });

  it('rejects requests without company context', async () => {
    const controller = new FiscalCompatibilityController(
      cbsIbsEngine,
      fiscalService,
    );

    await expect(controller.getTaxData()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects invalid revenue values', async () => {
    const controller = new FiscalCompatibilityController(
      cbsIbsEngine,
      fiscalService,
    );

    await expect(
      controller.getTaxData('company-001', undefined, 'valor-invalido'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
