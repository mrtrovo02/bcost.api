'use strict';

import type { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';
import type { TaxScenarioModel } from './tax-scenarios.types.js';

export type TaxScenarioRegressionFixture = {
  id: string;
  criticality: 'BLOCKER' | 'HIGH' | 'MEDIUM';
  description: string;
  legalBasis: string[];
  tolerance: {
    money: number;
    percentage: number;
  };
  input: SimulateTaxScenarioDto;
  expected: {
    bestEstimatedModel: TaxScenarioModel;
    factorRPercentage: number;
    requiredPayrollForThreshold: number;
    cbsInformative2026: number;
    ibsInformative2026: number;
    comparisons: Partial<
      Record<
        TaxScenarioModel,
        {
          eligibilityStatus?: 'ELIGIBLE' | 'INELIGIBLE' | 'REQUIRES_REVIEW';
          estimatedTax: number;
          estimatedEffectiveRate: number;
          netAnnualResult: number;
        }
      >
    >;
  };
};

export const TAX_SCENARIO_REGRESSION_FIXTURES: TaxScenarioRegressionFixture[] = [
  {
    id: 'MEI_LIMIT_WITHOUT_PAYROLL',
    criticality: 'HIGH',
    description:
      'Receita anualizada no limite usual do MEI, sem folha, mantendo elegibilidade estimativa e CBS/IBS informativo de 2026.',
    legalBasis: [
      'Portal gov.br/Empresas e Negocios: limite anual usual do MEI de R$ 81.000,00.',
      'LC 214/2025: fase de calibracao de CBS/IBS em 2026 com destaque informativo.',
    ],
    tolerance: {
      money: 0,
      percentage: 0,
    },
    input: {
      activity: 'CREATOR',
      monthlyRevenue: 6_750,
      monthlyDeductibleExpenses: 500,
      monthlyPayroll: 0,
      dependents: 0,
      currentModel: 'MEI',
    },
    expected: {
      bestEstimatedModel: 'MEI',
      factorRPercentage: 0,
      requiredPayrollForThreshold: 22_680,
      cbsInformative2026: 729,
      ibsInformative2026: 81,
      comparisons: {
        MEI: {
          eligibilityStatus: 'ELIGIBLE',
          estimatedTax: 1_020,
          estimatedEffectiveRate: 1.26,
          netAnnualResult: 79_980,
        },
      },
    },
  },
  {
    id: 'SIMPLES_EPP_LIMIT_FACTOR_R_EXACT_THRESHOLD',
    criticality: 'BLOCKER',
    description:
      'Receita anualizada no limite de EPP e Fator R exatamente em 28%, preservando Simples elegivel em Anexo III estimativo.',
    legalBasis: [
      'LC 123/2006, art. 3, II: limite de receita bruta anual de R$ 4.800.000,00 para EPP.',
      'LC 123/2006, art. 18 e anexos: fator R e aliquota efetiva por RBT12.',
    ],
    tolerance: {
      money: 0,
      percentage: 0,
    },
    input: {
      activity: 'TECHNOLOGY',
      monthlyRevenue: 400_000,
      monthlyDeductibleExpenses: 50_000,
      monthlyPayroll: 112_000,
      dependents: 0,
      currentModel: 'SIMPLES_NACIONAL',
    },
    expected: {
      bestEstimatedModel: 'PF',
      factorRPercentage: 28,
      requiredPayrollForThreshold: 0,
      cbsInformative2026: 43_200,
      ibsInformative2026: 4_800,
      comparisons: {
        SIMPLES_NACIONAL: {
          eligibilityStatus: 'ELIGIBLE',
          estimatedTax: 936_000,
          estimatedEffectiveRate: 19.5,
          netAnnualResult: 1_920_000,
        },
      },
    },
  },
  {
    id: 'SIMPLES_OVER_LIMIT_BLOCKED',
    criticality: 'BLOCKER',
    description:
      'Receita anualizada acima do limite de EPP bloqueia Simples Nacional e impede proposta automatica para esse regime.',
    legalBasis: [
      'LC 123/2006, art. 3, II: limite de receita bruta anual de R$ 4.800.000,00 para EPP.',
    ],
    tolerance: {
      money: 0,
      percentage: 0,
    },
    input: {
      activity: 'LEGAL',
      monthlyRevenue: 410_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 115_000,
      dependents: 0,
      currentModel: 'SIMPLES_NACIONAL',
    },
    expected: {
      bestEstimatedModel: 'PF',
      factorRPercentage: 28.05,
      requiredPayrollForThreshold: 0,
      cbsInformative2026: 44_280,
      ibsInformative2026: 4_920,
      comparisons: {
        SIMPLES_NACIONAL: {
          eligibilityStatus: 'INELIGIBLE',
          estimatedTax: -1,
          estimatedEffectiveRate: 0,
          netAnnualResult: 0,
        },
      },
    },
  },
  {
    id: 'SERVICE_FACTOR_R_BELOW_THRESHOLD_ANNEX_V',
    criticality: 'BLOCKER',
    description:
      'Prestador de servicos com Fator R abaixo de 28% deve exigir revisao e aplicar carga estimativa de Anexo V no Simples.',
    legalBasis: [
      'LC 123/2006, art. 18 e anexos: atividades sujeitas ao fator R podem alternar entre Anexo III e V.',
    ],
    tolerance: {
      money: 0,
      percentage: 0,
    },
    input: {
      activity: 'SERVICE_PROVIDER',
      monthlyRevenue: 220_000,
      monthlyDeductibleExpenses: 35_000,
      monthlyPayroll: 50_000,
      dependents: 1,
      currentModel: 'PF',
    },
    expected: {
      bestEstimatedModel: 'PF',
      factorRPercentage: 22.73,
      requiredPayrollForThreshold: 139_200,
      cbsInformative2026: 23_760,
      ibsInformative2026: 2_640,
      comparisons: {
        SIMPLES_NACIONAL: {
          eligibilityStatus: 'ELIGIBLE',
          estimatedTax: 545_100,
          estimatedEffectiveRate: 20.65,
          netAnnualResult: 1_074_900,
        },
      },
    },
  },
];
