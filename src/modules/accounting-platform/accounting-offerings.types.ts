'use strict';

import { OperationalCapability } from '../operational-workflows/operational-workflow.types.js';
import { AccountingPlatformBlock } from './accounting-platform.types.js';

export type AccountingOfferingMarketStatus =
  | 'MARKET_READY'
  | 'ASSISTED_SELLABLE'
  | 'WAITLIST_ONLY'
  | 'INTERNAL_ROADMAP';

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
