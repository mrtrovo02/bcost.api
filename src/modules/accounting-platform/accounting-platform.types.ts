'use strict';

import { OperationalCapability } from '../operational-workflows/operational-workflow.types.js';

export type AccountingPlatformBlock =
  | 'ONBOARDING_LEGALIZATION'
  | 'RECURRING_ACCOUNTING_TAX'
  | 'FINTECH_VALUE_ADDED'
  | 'SERVICE_ARCHITECTURE';

export type AccountingPlatformMaturity =
  | 'ACTIVE'
  | 'INTEGRATING'
  | 'PLANNED'
  | 'REQUIRES_PARTNER'
  | 'REQUIRES_HUMAN_OPERATION';

export type AccountingPlatformReadinessGap = {
  code: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKER';
  message: string;
};

export type AccountingPlatformPriorityTier = 'P0' | 'P1' | 'P2' | 'P3';

export type AccountingPlatformCoverageItem = {
  id: string;
  block: AccountingPlatformBlock;
  title: string;
  objective: string;
  engineeringExecution: string;
  bcostModules: string[];
  serviceCatalogIds: string[];
  requiredCapabilities: OperationalCapability[];
  automationBoundary: 'SOFTWARE_ONLY' | 'ASSISTED_AUTOMATION' | 'CRC_VALIDATED' | 'HUMAN_LED';
  maturity: AccountingPlatformMaturity;
  officialEvidence: string[];
  readinessGaps?: AccountingPlatformReadinessGap[];
  nextActions?: string[];
  priorityScore?: number;
  priorityTier?: AccountingPlatformPriorityTier;
};

export type AccountingPlatformCoverageResponse = {
  status: 'OK';
  items: AccountingPlatformCoverageItem[];
  summary: {
    total: number;
    active: number;
    integrating: number;
    planned: number;
    requiresPartner: number;
    requiresHumanOperation: number;
    crcValidated: number;
    blockers: number;
    warnings: number;
    p0: number;
    p1: number;
  };
  generatedAt: string;
};

export type AccountingMarketReadinessStatus =
  | 'PRODUCTION_READY'
  | 'ASSISTED_READY'
  | 'INTEGRATION_REQUIRED'
  | 'BLOCKED';

export type AccountingMarketReadinessTrack = {
  code:
    | 'CRC_GOVERNANCE'
    | 'LEGALIZATION_ENGINE'
    | 'MONTHLY_TAX_CORE'
    | 'OFFICIAL_OBLIGATIONS'
    | 'NFSE_ISSUANCE'
    | 'PAYROLL_ESOCIAL'
    | 'BANKING_BAAS'
    | 'SECURITY_LGPD'
    | 'CUSTOMER_SUCCESS_OPS';
  title: string;
  priority: AccountingPlatformPriorityTier;
  owner:
    | 'PRODUCT'
    | 'ENGINEERING'
    | 'BACKOFFICE'
    | 'CRC'
    | 'GOVERNMENT_INTEGRATIONS'
    | 'FINTECH_PARTNERS'
    | 'SECURITY'
    | 'CUSTOMER_SUCCESS';
  status: AccountingMarketReadinessStatus;
  automationBoundary: 'SOFTWARE_ONLY' | 'ASSISTED_AUTOMATION' | 'CRC_VALIDATED' | 'HUMAN_LED';
  gap: string;
  implementationActions: string[];
  officialDependencies: string[];
  requiredEvidence: string[];
  sourceBasis: string[];
  estimatedImpact: 'REVENUE_CRITICAL' | 'RISK_CRITICAL' | 'SCALE_CRITICAL' | 'EFFICIENCY';
};

export type AccountingMarketReadinessResponse = {
  status: 'OK';
  score: number;
  marketPosition:
    | 'NOT_SELLABLE_AS_FULL_ACCOUNTING'
    | 'ASSISTED_ACCOUNTING_PILOT'
    | 'MARKET_READY_WITH_GUARDRAILS'
    | 'SCALE_READY';
  summary: {
    totalTracks: number;
    productionReady: number;
    assistedReady: number;
    integrationRequired: number;
    blocked: number;
    p0: number;
    p1: number;
  };
  tracks: AccountingMarketReadinessTrack[];
  nextBuildQueue: {
    id: string;
    priority: AccountingPlatformPriorityTier;
    owner: AccountingMarketReadinessTrack['owner'];
    action: string;
    unlocks: string[];
  }[];
  executiveGuardrails: string[];
  generatedAt: string;
};

export type AccountingSetupOperation =
  | 'COMPANY_OPENING'
  | 'ACCOUNTING_MIGRATION'
  | 'MEI_TO_ME_MIGRATION';

export type AccountingSetupReadinessInput = {
  companyId?: string;
  operation?: AccountingSetupOperation;
  state?: string;
  municipalityCode?: string;
  legalNature?: 'LTDA' | 'SLU' | 'EI' | 'MEI' | 'OTHER';
  taxRegime?: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
  hasPartnerDocuments?: boolean;
  hasAddressProof?: boolean;
  hasViabilityCheck?: boolean;
  hasDigitalCertificate?: boolean;
  hasCrcResponsible?: boolean;
  hasBackofficeOwner?: boolean;
  hasAuditEvidenceStore?: boolean;
  hasOfficialPortalAccess?: boolean;
  hasMunicipalCoverage?: boolean;
  hasPreviousAccountingDocs?: boolean;
  hasMeiDeregistrationEvidence?: boolean;
};

export type AccountingSetupReadinessResponse = {
  status: 'OK';
  operation: AccountingSetupOperation;
  companyId?: string;
  decision: 'READY_FOR_ASSISTED_EXECUTION' | 'REQUIRES_SETUP' | 'BLOCKED';
  score: number;
  gates: {
    code: string;
    label: string;
    status: 'PASS' | 'WARN' | 'FAIL';
    owner:
      | 'CUSTOMER'
      | 'BACKOFFICE'
      | 'CRC'
      | 'GOVERNMENT_INTEGRATIONS'
      | 'PUBLIC_AGENCY';
    message: string;
  }[];
  stages: {
    id: string;
    title: string;
    owner:
      | 'CUSTOMER'
      | 'BACKOFFICE'
      | 'CRC'
      | 'GOVERNMENT_INTEGRATIONS'
      | 'PUBLIC_AGENCY';
    automationBoundary: 'SOFTWARE_ONLY' | 'ASSISTED_AUTOMATION' | 'CRC_VALIDATED' | 'HUMAN_LED';
    status: 'READY' | 'REQUIRES_ACTION' | 'BLOCKED';
    evidenceRequired: string[];
  }[];
  evidenceRequired: string[];
  setupDossier: {
    id: string;
    integrityHash: string;
    requiredArtifacts: {
      code: string;
      label: string;
      status: 'READY' | 'PENDING' | 'MISSING';
      source: 'CUSTOMER' | 'BCOST' | 'CRC' | 'GOVERNMENT_PORTAL' | 'PUBLIC_AGENCY';
    }[];
  };
  officialDependencies: string[];
  nextActions: string[];
  guardrails: string[];
  generatedAt: string;
};
