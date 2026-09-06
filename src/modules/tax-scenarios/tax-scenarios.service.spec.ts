'use strict';

import { TaxScenariosService } from './tax-scenarios.service.js';
import { TAX_SCENARIO_REGRESSION_SUITE } from './tax-scenarios.regression-fixtures.js';
import type {
  TaxScenarioCalculation,
  TaxScenarioModel,
  TaxScenarioRecommendation,
} from './tax-scenarios.types.js';

type RecommendationBuilder = {
  buildRecommendation(
    input: Parameters<TaxScenariosService['simulate']>[0],
    bestModel: TaxScenarioModel,
    comparisons: TaxScenarioCalculation[],
    factorRPercentage: number,
    annualRevenue: number,
  ): TaxScenarioRecommendation;
};

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
    expect(result.regressionSuite).toMatchObject({
      version: 'tax-scenarios-regression-2026.1',
      owner: 'tax-scenarios',
    });
    expect(result.regressionSuite.coveredRules).toContain(
      'FACTOR_R_THRESHOLD_28_PERCENT',
    );
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

  it('bloqueia promessa de ganho anual quando a oportunidade PJ ainda não tem revisão CRC', () => {
    const builder = service as unknown as RecommendationBuilder;
    const recommendation = builder.buildRecommendation(
      {
        activity: 'CONSULTING',
        monthlyRevenue: 30_000,
        monthlyDeductibleExpenses: 4_000,
        monthlyPayroll: 20_000,
        dependents: 1,
        currentModel: 'LUCRO_PRESUMIDO',
        hasCrcReview: false,
      },
      'SIMPLES_NACIONAL',
      [
        buildTaxScenarioCalculation('LUCRO_PRESUMIDO', 220_000),
        buildTaxScenarioCalculation('SIMPLES_NACIONAL', 280_000),
      ],
      55,
      360_000,
    );

    expect(recommendation.decision).toBe('PJ_SIMULATION_RECOMMENDED');
    expect(recommendation.rationale.join(' ')).toContain(
      'Diferença econômica preliminar identificada',
    );
    expect(recommendation.rationale.join(' ')).toContain(
      'condicionada à revisão CRC',
    );
    expect(recommendation.rationale.join(' ')).not.toContain(
      'Ganho anual estimado',
    );
  });

  it('usa linguagem de diferença econômica mesmo quando a oportunidade tem revisão CRC', () => {
    const builder = service as unknown as RecommendationBuilder;
    const recommendation = builder.buildRecommendation(
      {
        activity: 'CONSULTING',
        monthlyRevenue: 30_000,
        monthlyDeductibleExpenses: 4_000,
        monthlyPayroll: 20_000,
        dependents: 1,
        currentModel: 'LUCRO_PRESUMIDO',
        hasCrcReview: true,
      },
      'SIMPLES_NACIONAL',
      [
        buildTaxScenarioCalculation('LUCRO_PRESUMIDO', 220_000),
        buildTaxScenarioCalculation('SIMPLES_NACIONAL', 280_000),
      ],
      55,
      360_000,
    );

    expect(recommendation.rationale.join(' ')).toContain(
      'Diferença econômica revisada',
    );
    expect(recommendation.rationale.join(' ')).not.toContain('Ganho anual');
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
    expect(result.legalRiskAssessment).toMatchObject({
      version: 'tax-scenarios-legal-risk-2026.1',
      assessmentMode: 'CODE_BASED_SYSTEMIC_REVIEW',
      legalReliability: 'TRIAGE_ONLY',
      riskLevel: 'HIGH',
      canAdvertiseSavings: false,
      canUseAsOfficialAssessment: false,
      evidenceGate: {
        status: 'OPEN',
      },
    });
    expect(result.legalRiskAssessment.requiredDisclosures.join(' ')).toContain(
      'sem substituir apuração oficial',
    );
    expect(result.legalRiskAssessment.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FACTOR_R_SERVICE_REVIEW',
          severity: 'HIGH',
        }),
        expect.objectContaining({
          code: 'OFFICIAL_ASSESSMENT_LOCK',
          severity: 'HIGH',
        }),
      ]),
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

  it('retorna manifesto de fontes legais versionado para auditoria de release', () => {
    const result = service.simulate({
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 80_000,
      monthlyDeductibleExpenses: 8_000,
      monthlyPayroll: 24_000,
      dependents: 0,
      currentModel: 'SIMPLES_NACIONAL',
    });

    expect(result.legalSourceManifest).toMatchObject({
      version: 'tax-scenarios-legal-sources-2026.1',
      jurisdiction: 'BR',
      calculationMode: 'ESTIMATIVE_TRIAGE',
      officialAssessment: false,
    });
    expect(result.legalSourceManifest.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EC_132_2023',
          sourceType: 'CONSTITUTIONAL_AMENDMENT',
        }),
        expect.objectContaining({
          code: 'LC_214_2025',
          sourceType: 'COMPLEMENTARY_LAW',
        }),
        expect.objectContaining({
          code: 'LC_123_2006',
          sourceType: 'COMPLEMENTARY_LAW',
        }),
        expect.objectContaining({
          code: 'BCOST_TAX_POLICY',
          sourceType: 'SYSTEM_POLICY',
        }),
      ]),
    );
    expect(result.legalSourceManifest.releaseGuardrails.join(' ')).toContain(
      'officialAssessment=false',
    );
  });

  it('retorna identificador determinístico para rastrear a simulação', () => {
    const input = {
      activity: 'SERVICE_PROVIDER' as const,
      monthlyRevenue: 80_000,
      monthlyDeductibleExpenses: 8_000,
      monthlyPayroll: 24_000,
      dependents: 0,
      currentModel: 'SIMPLES_NACIONAL' as const,
    };

    expect(service.simulate(input).scenarioId).toBe(service.scenarioId(input));
    expect(service.simulate(input).scenarioId).toMatch(/^[a-f0-9]{16}$/);
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
      riskLevel: 'HIGH',
      checkoutAllowed: false,
      serviceSku: 'PF_TAX_REVIEW',
      checkoutMode: 'SALES_REVIEW_ONLY',
      nextRoute: '/dashboard/modules/company-formation',
    });
    expect(result.preProposal.readinessScore).toBeLessThan(80);
    expect(result.preProposal.reviewReasons).toContain('OFFICIAL_ASSESSMENT_LOCK');
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
    expect(new Date(result.preProposal.validUntil).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(result.preProposal.refreshTriggers.join(' ')).toContain(
      'Alteração de faturamento',
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
      riskLevel: 'CRITICAL',
      checkoutAllowed: false,
      serviceSku: 'COMPLIANCE_BLOCKER_REVIEW',
      nextRoute: '/dashboard/modules/audit-intelligence',
    });
    expect(result.legalRiskAssessment).toMatchObject({
      legalReliability: 'BLOCKED_FOR_AUTOMATED_SALE',
      riskLevel: 'CRITICAL',
      canAdvertiseSavings: false,
      evidenceGate: {
        status: 'BLOCKED',
      },
    });
    expect(result.legalRiskAssessment.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MEI_ELIGIBILITY',
          severity: 'CRITICAL',
        }),
      ]),
    );
    expect(result.preProposal.readinessScore).toBeLessThan(50);
    expect(result.preProposal.blockingReasons).toContain('MEI_ELIGIBILITY');
    expect(result.preProposal.ctaLabel).toBe('Abrir revisão de compliance');
  });

  it('mantém economia bloqueada para publicidade enquanto houver dossiê documental aberto', () => {
    const result = service.simulate({
      activity: 'CREATOR',
      monthlyRevenue: 5_000,
      monthlyDeductibleExpenses: 500,
      monthlyPayroll: 0,
      dependents: 0,
      currentModel: 'PF',
      hasCrcReview: true,
    });

    expect(result.preProposal.checkoutAllowed).toBe(true);
    expect(result.legalRiskAssessment.evidenceGate.status).toBe('OPEN');
    expect(result.legalRiskAssessment.evidenceGate.missingEvidence.length).toBeGreaterThan(0);
    expect(result.legalRiskAssessment.canAdvertiseSavings).toBe(false);
    expect(result.legalRiskAssessment.canUseAsOfficialAssessment).toBe(false);
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

  describe('fixtures regressivas de QA tributário', () => {
    it('declara versão, cobertura e criticidades bloqueantes da suíte', () => {
      expect(TAX_SCENARIO_REGRESSION_SUITE).toMatchObject({
        version: 'tax-scenarios-regression-2026.1',
        owner: 'tax-scenarios',
        blockingCriticalities: ['BLOCKER', 'HIGH'],
      });
      expect(TAX_SCENARIO_REGRESSION_SUITE.coveredRules).toEqual(
        expect.arrayContaining([
          'SIMPLES_EPP_REVENUE_LIMIT',
          'FACTOR_R_THRESHOLD_28_PERCENT',
          'CBS_IBS_2026_INFORMATIVE_RATES',
        ]),
      );
      expect(TAX_SCENARIO_REGRESSION_SUITE.fixtures.length).toBeGreaterThanOrEqual(4);
    });

    it.each(TAX_SCENARIO_REGRESSION_SUITE.fixtures)(
      'preserva contrato fiscal $id',
      (fixture) => {
        const result = service.simulate(fixture.input);

        expect(fixture.criticality).toMatch(/^(BLOCKER|HIGH|MEDIUM)$/);
        expect(fixture.legalBasis.length).toBeGreaterThan(0);
        expect(result.bestEstimatedModel).toBe(fixture.expected.bestEstimatedModel);
        expect(result.factorR.percentage).toBeCloseTo(
          fixture.expected.factorRPercentage,
          fixture.tolerance.percentage,
        );
        expect(result.factorR.requiredPayrollForThreshold).toBeCloseTo(
          fixture.expected.requiredPayrollForThreshold,
          fixture.tolerance.money,
        );
        expect(result.reformImpact.estimatedCbs).toBeCloseTo(
          fixture.expected.cbsInformative2026,
          fixture.tolerance.money,
        );
        expect(result.reformImpact.estimatedIbs).toBeCloseTo(
          fixture.expected.ibsInformative2026,
          fixture.tolerance.money,
        );
        expect(result.complianceTrail.officialAssessment).toBe(false);
        expect(result.calculationAudit.lines.length).toBeGreaterThan(0);

        Object.entries(fixture.expected.comparisons).forEach(
          ([model, expectedComparison]) => {
            const comparison = result.comparisons.find(
              (item) => item.model === model,
            );

            expect(comparison).toBeDefined();
            expect(comparison?.eligibilityStatus).toBe(
              expectedComparison.eligibilityStatus,
            );
            expect(comparison?.estimatedTax).toBeCloseTo(
              expectedComparison.estimatedTax,
              fixture.tolerance.money,
            );
            expect(comparison?.estimatedEffectiveRate).toBeCloseTo(
              expectedComparison.estimatedEffectiveRate,
              fixture.tolerance.percentage,
            );
            expect(comparison?.netAnnualResult).toBeCloseTo(
              expectedComparison.netAnnualResult,
              fixture.tolerance.money,
            );
          },
        );
      },
    );
  });
});

function buildTaxScenarioCalculation(
  model: TaxScenarioModel,
  netAnnualResult: number,
): TaxScenarioCalculation {
  return {
    model,
    eligibilityStatus: 'ELIGIBLE',
    annualRevenue: 360_000,
    annualDeductibleExpenses: 48_000,
    annualPayroll: 240_000,
    taxableBase: 360_000,
    estimatedTax: 40_000,
    estimatedEffectiveRate: 11.11,
    netAnnualResult,
    monthlyNetResult: Number((netAnnualResult / 12).toFixed(2)),
    warnings: [],
    components: [],
  };
}
