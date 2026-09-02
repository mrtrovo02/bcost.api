'use strict';

import { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';

export type TaxScenarioModel =
  | 'PF'
  | 'MEI'
  | 'SIMPLES_NACIONAL'
  | 'LUCRO_PRESUMIDO';

export type TaxScenarioCalculation = {
  model: TaxScenarioModel;
  eligibilityStatus?: 'ELIGIBLE' | 'INELIGIBLE' | 'REQUIRES_REVIEW';
  legalBasis?: string[];
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

export type TaxComplianceRuleStatus =
  | 'PASSED'
  | 'BLOCKED'
  | 'REQUIRES_REVIEW'
  | 'INFORMATIONAL';

export type TaxComplianceRuleSeverity =
  | 'INFO'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type TaxComplianceRuleEvaluation = {
  code: string;
  status: TaxComplianceRuleStatus;
  severity: TaxComplianceRuleSeverity;
  title: string;
  result: string;
  legalBasis: string[];
  evidenceRequired: string[];
  officialAssessment: boolean;
};

export type TaxScenarioComplianceTrail = {
  version: string;
  calculationMode: 'ESTIMATIVE_TRIAGE';
  officialAssessment: false;
  evaluatedAt: string;
  commercialDecision: {
    status:
      | 'AUTO_PROPOSAL_ALLOWED'
      | 'ASSISTED_REVIEW_REQUIRED'
      | 'BLOCKED_BY_COMPLIANCE';
    canGenerateProposal: boolean;
    requiresCrcReview: boolean;
    reasons: string[];
    blockedRuleCodes: string[];
    reviewRuleCodes: string[];
  };
  rules: TaxComplianceRuleEvaluation[];
  disclaimers: string[];
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
  complianceTrail: TaxScenarioComplianceTrail;
  guardrails: string[];
  generatedAt: string;
};
