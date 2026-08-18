'use strict';

import { ServiceExecutionEngine } from '../service-catalog/service-catalog.types.js';

export type OperationalWorkflowActor =
  | 'BCOST_SOFTWARE'
  | 'OFFICIAL_INTEGRATION'
  | 'BACKOFFICE_OPERATOR'
  | 'CRC_ACCOUNTANT'
  | 'CUSTOMER'
  | 'PUBLIC_AGENCY';

export type OperationalWorkflowStageStatus =
  | 'READY'
  | 'REQUIRES_INTEGRATION'
  | 'REQUIRES_BACKOFFICE'
  | 'REQUIRES_CUSTOMER'
  | 'REQUIRES_CRC';

export type OperationalWorkflowRuntimeStatus =
  | 'NOT_STARTED'
  | 'WAITING_DEPENDENCY'
  | 'READY_TO_RUN'
  | 'IN_PROGRESS'
  | 'WAITING_CUSTOMER'
  | 'WAITING_PUBLIC_AGENCY'
  | 'WAITING_CRC_REVIEW'
  | 'DONE'
  | 'BLOCKED';

export type OperationalCapability =
  | 'CUSTOMER_PORTAL'
  | 'BACKOFFICE_TEAM'
  | 'CRC_ACCOUNTANT'
  | 'DIGITAL_CERTIFICATE'
  | 'OFFICIAL_PORTAL_ACCESS'
  | 'OFFICIAL_API_PROVIDER'
  | 'MUNICIPAL_COVERAGE'
  | 'BAAS_PARTNER'
  | 'OPEN_FINANCE_PROVIDER'
  | 'AUDIT_EVIDENCE_STORE';

export type OperationalCapabilityCategory =
  | 'PLATFORM'
  | 'BACKOFFICE'
  | 'REGULATORY'
  | 'GOVERNMENT'
  | 'FINTECH'
  | 'AUDIT';

export type OperationalCapabilityCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type OperationalCapabilityDefinition = {
  code: OperationalCapability;
  label: string;
  description: string;
  category: OperationalCapabilityCategory;
  criticality: OperationalCapabilityCriticality;
};

export type OperationalWorkflowStage = {
  id: string;
  title: string;
  actor: OperationalWorkflowActor;
  status: OperationalWorkflowStageStatus;
  runtimeStatus: OperationalWorkflowRuntimeStatus;
  allowedTransitions: OperationalWorkflowRuntimeStatus[];
  executionEngine: ServiceExecutionEngine;
  requiredCapabilities: OperationalCapability[];
  evidenceRequired: string[];
  blockingReason?: string;
};

export type OperationalWorkflowPreview = {
  serviceId: string;
  serviceName: string;
  macroServiceId: number;
  macroServiceName: string;
  automationLevel: string;
  productionReadiness: string;
  operationalRisk: string;
  stages: OperationalWorkflowStage[];
  operationalSummary: {
    totalStages: number;
    readyStages: number;
    dependencyStages: number;
    humanStages: number;
    evidenceArtifacts: number;
    requiredCapabilities: number;
  };
  requiredCapabilities: OperationalCapability[];
  capabilityDetails: OperationalCapabilityDefinition[];
  gates: {
    requiresCrcValidation: boolean;
    requiresOfficialCredential: boolean;
    requiresCustomerAction: boolean;
  };
  generatedAt: string;
};
