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
  code: string;
  label: string;
  owner: 'PRODUCT' | 'BACKOFFICE' | 'CRC' | 'GOVERNMENT_INTEGRATIONS' | 'FINTECH_PARTNERS' | 'GOVERNANCE';
  status: AccountingOfferingActivationStatus;
  evidenceRequired: string[];
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
