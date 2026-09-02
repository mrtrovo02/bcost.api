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
    expect(result.recommendation.decision).toBe('PF_REVIEW_RECOMMENDED');
    expect(result.recommendation.rationale.join(' ')).toContain(
      'abaixo do limiar de 28%',
    );
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
    const simples = result.comparisons.find(
      (item) => item.model === 'SIMPLES_NACIONAL',
    );
    const lucroPresumido = result.comparisons.find(
      (item) => item.model === 'LUCRO_PRESUMIDO',
    );

    expect(result.factorR.percentage).toBe(320);
    expect(result.bestEstimatedModel).toBe('PF');
    expect(result.recommendation.decision).toBe('PF_REVIEW_RECOMMENDED');
    expect(mei?.eligibilityStatus).toBe('REQUIRES_REVIEW');
    expect(mei?.estimatedTax).toBe(-1);
    expect(mei?.warnings.join(' ')).toContain('folha informada');
    expect(simples?.netAnnualResult).toBeLessThan(0);
    expect(lucroPresumido?.netAnnualResult).toBeLessThan(0);
  });

  it('não informa ganho anual contra modelo atual inelegível', () => {
    const result = service.simulate({
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 220_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 50_000,
      dependents: 1,
      currentModel: 'MEI',
    });

    expect(result.bestEstimatedModel).toBe('PF');
    expect(result.recommendation.rationale.join(' ')).not.toContain(
      'Ganho anual estimado',
    );
  });

  it('retorna trilha de compliance para impedir uso como apuração oficial automática', () => {
    const result = service.simulate({
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 220_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 50_000,
      dependents: 1,
      currentModel: 'PF',
    });

    expect(result.complianceTrail.version).toBe(
      'tax-scenarios-compliance-2026.1',
    );
    expect(result.complianceTrail.officialAssessment).toBe(false);
    expect(result.complianceTrail.calculationMode).toBe('ESTIMATIVE_TRIAGE');
    expect(result.complianceTrail.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FACTOR_R_SERVICE_REVIEW',
          status: 'REQUIRES_REVIEW',
          severity: 'HIGH',
          officialAssessment: false,
        }),
        expect.objectContaining({
          code: 'OFFICIAL_ASSESSMENT_LOCK',
          status: 'REQUIRES_REVIEW',
          severity: 'HIGH',
          officialAssessment: false,
        }),
      ]),
    );
    expect(result.complianceTrail.commercialDecision).toMatchObject({
      status: 'ASSISTED_REVIEW_REQUIRED',
      canGenerateProposal: false,
      requiresCrcReview: true,
    });
    expect(result.complianceTrail.commercialDecision.reviewRuleCodes).toContain(
      'FACTOR_R_SERVICE_REVIEW',
    );
  });

  it('retorna memória de cálculo com fórmulas e fontes rastreáveis', () => {
    const result = service.simulate({
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 220_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 50_000,
      dependents: 1,
      currentModel: 'PF',
    });

    expect(result.calculationAudit.version).toBe(
      'tax-scenarios-calculation-audit-2026.1',
    );
    expect(result.calculationAudit.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FACTOR_R',
          formula: 'folha_12_meses / receita_bruta_12_meses * 100',
          result: 22.73,
          officialAssessment: false,
        }),
        expect.objectContaining({
          code: 'SIMPLES_EFFECTIVE_RATE',
          officialAssessment: false,
        }),
        expect.objectContaining({
          code: 'CBS_IBS_INFORMATIVE_2026',
          officialAssessment: false,
        }),
      ]),
    );
  });

  it('qualifica a oferta comercial sem permitir venda automática quando PF permanece melhor', () => {
    const result = service.simulate({
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 220_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 50_000,
      dependents: 1,
      currentModel: 'PF',
    });

    expect(result.serviceQualification).toMatchObject({
      stage: 'NEEDS_DISCOVERY',
      primaryOffer: {
        sku: 'PF_TAX_REVIEW',
        checkoutMode: 'SALES_REVIEW_ONLY',
      },
    });
    expect(result.serviceQualification.allowedActions).toContain(
      'SCHEDULE_CRC_REVIEW',
    );
    expect(result.serviceQualification.salesWarnings.join(' ')).toContain(
      'Não vender abertura ou migração PJ',
    );
    expect(result.preProposal).toMatchObject({
      status: 'NEEDS_DISCOVERY',
      checkoutAllowed: false,
      serviceSku: 'PF_TAX_REVIEW',
      checkoutMode: 'SALES_REVIEW_ONLY',
      nextRoute: '/dashboard/modules/company-formation',
    });
    expect(result.preProposal.documentChecklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RBT12_AND_REVENUE_SEGREGATION',
          required: true,
        }),
        expect.objectContaining({
          code: 'FISCAL_DOCUMENTS_SAMPLE',
          required: true,
        }),
      ]),
    );
    expect(result.preProposal.legalTerms.join(' ')).toContain(
      'não representa apuração oficial',
    );
  });

  it('bloqueia checkout quando o modelo atual possui regra crítica de compliance', () => {
    const result = service.simulate({
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 220_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 50_000,
      dependents: 1,
      currentModel: 'MEI',
    });

    expect(result.serviceQualification).toMatchObject({
      stage: 'BLOCKED',
      primaryOffer: {
        sku: 'COMPLIANCE_BLOCKER_REVIEW',
        checkoutMode: 'BLOCKED',
      },
    });
    expect(result.serviceQualification.allowedActions).toContain(
      'BLOCK_AUTOMATIC_CHECKOUT',
    );
    expect(result.preProposal).toMatchObject({
      status: 'BLOCKED_BY_COMPLIANCE',
      checkoutAllowed: false,
      serviceSku: 'COMPLIANCE_BLOCKER_REVIEW',
      nextRoute: '/dashboard/modules/audit-intelligence',
    });
    expect(result.preProposal.ctaLabel).toBe('Abrir revisão de compliance');
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
