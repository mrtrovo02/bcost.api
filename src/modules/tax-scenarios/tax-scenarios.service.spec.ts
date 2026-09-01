'use strict';

import { TaxScenariosService } from './tax-scenarios.service.js';

describe('TaxScenariosService', () => {
  let service: TaxScenariosService;

  beforeEach(() => {
    service = new TaxScenariosService();
  });

  it('gera comparação PF x PJ com guardrails regulatórios', () => {
    const result = service.simulate({
      activity: 'CONSULTING',
      monthlyRevenue: 30_000,
      monthlyDeductibleExpenses: 4_000,
      monthlyPayroll: 3_000,
      dependents: 1,
      currentModel: 'PF',
      hasCrcReview: false,
    });

    expect(result.status).toBe('OK');
    expect(result.comparisons.map((item) => item.model)).toEqual([
      'PF',
      'MEI',
      'SIMPLES_NACIONAL',
      'LUCRO_PRESUMIDO',
    ]);
    expect(result.factorR.percentage).toBe(10);
    expect(result.recommendation.decision).toBe('SIMPLES_WITH_FACTOR_R_REVIEW');
    expect(result.guardrails.join(' ')).toContain(
      'Não prometer economia tributária',
    );
    expect(result.reformImpact.estimatedCbs).toBe(3240);
    expect(result.reformImpact.estimatedIbs).toBe(360);
  });

  it('marca MEI como inviável quando receita anual ultrapassa limite orientativo', () => {
    const result = service.simulate({
      activity: 'CREATOR',
      monthlyRevenue: 10_000,
      monthlyDeductibleExpenses: 1_000,
      monthlyPayroll: 0,
      dependents: 0,
      currentModel: 'MEI',
    });
    const mei = result.comparisons.find((item) => item.model === 'MEI');

    expect(mei?.estimatedTax).toBe(-1);
    expect(mei?.warnings.join(' ')).toContain(
      'supera o limite anual usual do MEI',
    );
  });

  it('bloqueia recomendação de Simples Nacional quando receita anualizada ultrapassa R$ 4,8 milhões', () => {
    const result = service.simulate({
      activity: 'LEGAL',
      monthlyRevenue: 520_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 150_000,
      dependents: 5,
      currentModel: 'PF',
    });
    const simples = result.comparisons.find(
      (item) => item.model === 'SIMPLES_NACIONAL',
    );

    expect(result.factorR.percentage).toBe(28.85);
    expect(result.bestEstimatedModel).not.toBe('SIMPLES_NACIONAL');
    expect(result.recommendation.title).toBe(
      'Simples Nacional bloqueado pelo limite de receita',
    );
    expect(simples?.eligibilityStatus).toBe('INELIGIBLE');
    expect(simples?.estimatedTax).toBe(-1);
    expect(simples?.warnings.join(' ')).toContain('R$ 4.800.000,00');
    expect(result.guardrails.join(' ')).toContain(
      'bloqueia recomendação automática de Simples Nacional',
    );
  });

  it('bloqueia recomendação automática de MEI quando existe folha informada sem validação operacional', () => {
    const result = service.simulate({
      activity: 'TECHNOLOGY',
      monthlyRevenue: 5_000,
      monthlyDeductibleExpenses: 800,
      monthlyPayroll: 16_000,
      dependents: 3,
      currentModel: 'PF',
    });
    const mei = result.comparisons.find((item) => item.model === 'MEI');

    expect(result.factorR.percentage).toBe(320);
    expect(result.bestEstimatedModel).not.toBe('MEI');
    expect(mei?.eligibilityStatus).toBe('REQUIRES_REVIEW');
    expect(mei?.estimatedTax).toBe(-1);
    expect(mei?.warnings.join(' ')).toContain('folha informada');
  });

  it('gera scenarioId estável para o mesmo input', () => {
    const input = {
      activity: 'TECHNOLOGY' as const,
      monthlyRevenue: 20_000,
      monthlyDeductibleExpenses: 2_500,
      monthlyPayroll: 6_000,
      dependents: 0,
      currentModel: 'SIMPLES_NACIONAL' as const,
    };

    expect(service.scenarioId(input)).toBe(service.scenarioId(input));
    expect(service.scenarioId(input)).toMatch(/^[a-f0-9]{16}$/);
  });
});
