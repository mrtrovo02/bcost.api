import { TaxRegimeSimulatorService } from './tax-regime-simulator.service.js';

describe('TaxRegimeSimulatorService', () => {
  let service: TaxRegimeSimulatorService;

  beforeEach(() => {
    service = new TaxRegimeSimulatorService();
  });

  it('simula Lucro Presumido para servicos gerais com percentuais federais oficiais', () => {
    const result = service.simulate({
      revenue: 100000,
      months: 1,
      presumedActivity: 'services_general',
    });

    expect(result.lucroPresumido).toMatchObject({
      irpj: 4800,
      irpjAdditional: 1200,
      csll: 2880,
      pis: 650,
      cofins: 3000,
      total: 12530,
      effectiveRate: 12.53,
    });
  });

  it('simula Lucro Real com lucro informado, adicional IRPJ e creditos PIS/Cofins', () => {
    const result = service.simulate({
      revenue: 100000,
      profitBeforeTaxes: 30000,
      pisCofinsCreditBase: 20000,
      months: 1,
    });

    expect(result.lucroReal).toMatchObject({
      irpj: 4500,
      irpjAdditional: 1000,
      csll: 2700,
      pis: 1320,
      cofins: 6080,
      total: 15600,
      effectiveRate: 15.6,
    });
  });

  it('aplica o acrescimo da LC 224/2025 apenas na parcela anual acima de R$ 5 milhoes', () => {
    const result = service.simulate({
      revenue: 200000,
      months: 1,
      presumedActivity: 'commerce_industry',
      yearToDateRevenueBeforePeriod: 4900000,
    });

    expect(result.lucroPresumido).toMatchObject({
      irpj: 2520,
      irpjAdditional: 0,
      csll: 2268,
      pis: 1300,
      cofins: 6000,
      total: 12088,
      effectiveRate: 6.04,
    });
  });
});
