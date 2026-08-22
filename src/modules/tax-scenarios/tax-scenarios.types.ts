'use strict';

import { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';

export type TaxScenarioModel =
  | 'PF'
  | 'MEI'
  | 'SIMPLES_NACIONAL'
  | 'LUCRO_PRESUMIDO';

export type TaxScenarioCalculation = {
  model: TaxScenarioModel;
  annualRevenue: number;
  annualDeductibleExpenses: number;
  annualPayroll: number;
  taxableBase: number;
  estimatedTax: number;
  estimatedEffectiveRate: number;
  netAnnualResult: number;
  monthlyNetResult: number;
  warnings: string[];
  components: {
    code: string;
    label: string;
    amount: number;
    rate?: number;
    basis: string;
  }[];
};

export type TaxScenarioRecommendation = {
  decision:
    | 'PF_REVIEW_RECOMMENDED'
    | 'PJ_SIMULATION_RECOMMENDED'
    | 'SIMPLES_WITH_FACTOR_R_REVIEW'
    | 'ASSISTED_TAX_PLANNING_REQUIRED';
  title: string;
  rationale: string[];
  requiredEvidence: string[];
  nextActions: string[];
};

export type TaxScenarioSimulationResponse = {
  status: 'OK';
  input: SimulateTaxScenarioDto;
  assumptions: {
    code: string;
    description: string;
    sourceBasis: string[];
  }[];
  comparisons: TaxScenarioCalculation[];
  bestEstimatedModel: TaxScenarioModel;
  factorR: {
    percentage: number;
    qualifiesForAnexoIIIReview: boolean;
    requiredPayrollForThreshold: number;
  };
  reformImpact: {
    calibrationYear: 2026;
    cbsInformativeRate: number;
    ibsInformativeRate: number;
    estimatedCbs: number;
    estimatedIbs: number;
    note: string;
  };
  recommendation: TaxScenarioRecommendation;
  guardrails: string[];
  generatedAt: string;
};
