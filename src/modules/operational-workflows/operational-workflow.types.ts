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

export type OperationalWorkflowStage = {
  id: string;
  title: string;
  actor: OperationalWorkflowActor;
  status: OperationalWorkflowStageStatus;
  executionEngine: ServiceExecutionEngine;
  evidenceRequired: string[];
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
  gates: {
    requiresCrcValidation: boolean;
    requiresOfficialCredential: boolean;
    requiresCustomerAction: boolean;
  };
  generatedAt: string;
};
