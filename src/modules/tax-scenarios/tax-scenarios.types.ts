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

export type TaxCalculationAuditLine = {
  code: string;
  title: string;
  formula: string;
  inputs: Record<string, string | number | boolean>;
  result: string | number;
  sourceBasis: string[];
  officialAssessment: false;
};

export type TaxScenarioCalculationAudit = {
  version: string;
  generatedAt: string;
  lines: TaxCalculationAuditLine[];
};

export type TaxScenarioServiceQualification = {
  stage: 'QUALIFIED_LEAD' | 'NEEDS_DISCOVERY' | 'BLOCKED';
  primaryOffer: {
    sku:
      | 'PF_TAX_REVIEW'
      | 'TAX_REGIME_CRC_REVIEW'
      | 'PJ_MIGRATION_STUDY'
      | 'COMPLIANCE_BLOCKER_REVIEW';
    title: string;
    checkoutMode:
      | 'ASSISTED_CHECKOUT'
      | 'SALES_REVIEW_ONLY'
      | 'BLOCKED';
  };
  allowedActions: Array<
    | 'REQUEST_DOCUMENTS'
    | 'SCHEDULE_CRC_REVIEW'
    | 'CREATE_ASSISTED_PROPOSAL'
    | 'BLOCK_AUTOMATIC_CHECKOUT'
  >;
  missingEvidence: string[];
  salesWarnings: string[];
};

export type TaxScenarioPreProposalDocument = {
  code: string;
  label: string;
  required: boolean;
  source: 'CUSTOMER' | 'ACCOUNTANT' | 'BCOST_SYSTEM';
};

export type TaxScenarioPreProposal = {
  id: string;
  status:
    | 'READY_FOR_ASSISTED_REVIEW'
    | 'NEEDS_DISCOVERY'
    | 'BLOCKED_BY_COMPLIANCE';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readinessScore: number;
  validUntil: string;
  title: string;
  ctaLabel: string;
  nextRoute:
    | '/dashboard/modules/audit-intelligence'
    | '/dashboard/modules/company-formation'
    | '/dashboard/settings?section=billing';
  checkoutAllowed: boolean;
  serviceSku: TaxScenarioServiceQualification['primaryOffer']['sku'];
  checkoutMode: TaxScenarioServiceQualification['primaryOffer']['checkoutMode'];
  documentChecklist: TaxScenarioPreProposalDocument[];
  blockingReasons: string[];
  reviewReasons: string[];
  refreshTriggers: string[];
  legalTerms: string[];
};

export type TaxScenarioSimulationResponse = {
  status: 'OK';
  regressionSuite: {
    version: string;
    owner: 'tax-scenarios';
    coveredRules: string[];
    blockingCriticalities: string[];
  };
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
  calculationAudit: TaxScenarioCalculationAudit;
  serviceQualification: TaxScenarioServiceQualification;
  preProposal: TaxScenarioPreProposal;
  guardrails: string[];
  generatedAt: string;
};
