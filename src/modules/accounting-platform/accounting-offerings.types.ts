'use strict';

import { OperationalCapability } from '../operational-workflows/operational-workflow.types.js';
import { AccountingPlatformBlock } from './accounting-platform.types.js';

export type AccountingOfferingMarketStatus =
  | 'MARKET_READY'
  | 'ASSISTED_SELLABLE'
  | 'WAITLIST_ONLY'
  | 'INTERNAL_ROADMAP';

export type AccountingOfferingActivationStatus = 'READY' | 'REQUIRES_SETUP' | 'BLOCKED';

export type AccountingOfferingActivationRequirement = {
  code: OperationalCapability;
  label: string;
  owner: 'PRODUCT' | 'BACKOFFICE' | 'CRC' | 'GOVERNMENT_INTEGRATIONS' | 'FINTECH_PARTNERS' | 'GOVERNANCE';
  status: AccountingOfferingActivationStatus;
  evidenceRequired: string[];
};

export type AccountingOfferingPlaybookStage = {
  id: string;
  title: string;
  owner: AccountingOfferingActivationRequirement['owner'];
  targetSlaHours: number;
  entryCriteria: string[];
  exitCriteria: string[];
  evidenceRequired: string[];
  status: AccountingOfferingActivationStatus;
};

export type AccountingOfferingCompanyProfile = {
  companyId?: string;
  taxRegime?: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
  cnae?: string;
  municipalityCode?: string;
  hasDigitalCertificate?: boolean;
  hasCrcResponsible?: boolean;
  hasBackofficeOwner?: boolean;
  hasAuditEvidenceStore?: boolean;
  hasBaasPartner?: boolean;
  hasOpenFinanceConsent?: boolean;
  hasOfficialPortalAccess?: boolean;
  hasOfficialApiProvider?: boolean;
};

export type AccountingOfferingEligibilityStatus = 'PASS' | 'WARN' | 'FAIL';

export type AccountingOfferingEligibilityCheck = {
  code: string;
  label: string;
  status: AccountingOfferingEligibilityStatus;
  message: string;
};

export type AccountingOfferingCompanyAssessment = {
  status: 'OK';
  offeringId: string;
  offeringName: string;
  companyId?: string;
  decision: 'ACTIVATION_ALLOWED' | 'ASSISTED_REQUIRED' | 'BLOCKED';
  score: number;
  checks: AccountingOfferingEligibilityCheck[];
  requiredActions: string[];
  generatedAt: string;
};

export type AccountingOffering = {
  id: string;
  name: string;
  headline: string;
  targetCustomers: string[];
  blocks: AccountingPlatformBlock[];
  coverageItemIds: string[];
  includedServices: string[];
  excludedServices: string[];
  requiredCapabilities: OperationalCapability[];
  marketStatus: AccountingOfferingMarketStatus;
  marketGuardrails: string[];
  launchReadinessScore: number;
  commercialDecision: string;
  activationRequirements: AccountingOfferingActivationRequirement[];
  activationSummary: {
    total: number;
    ready: number;
    requiresSetup: number;
    blocked: number;
  };
  activationPlaybook: AccountingOfferingPlaybookStage[];
};

export type AccountingOfferingsResponse = {
  status: 'OK';
  offerings: AccountingOffering[];
  summary: {
    total: number;
    marketReady: number;
    assistedSellable: number;
    waitlistOnly: number;
    internalRoadmap: number;
  };
  generatedAt: string;
};
