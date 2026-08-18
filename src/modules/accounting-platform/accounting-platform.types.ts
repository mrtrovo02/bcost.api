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
