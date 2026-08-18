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
  officialDependencies: string[];
  nextActions: string[];
  guardrails: string[];
  generatedAt: string;
};
