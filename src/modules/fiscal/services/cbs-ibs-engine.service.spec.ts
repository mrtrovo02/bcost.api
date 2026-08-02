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
});
