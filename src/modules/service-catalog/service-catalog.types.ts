'use strict';

export type BcostPlan =
  | 'BASIC'
  | 'STANDARD'
  | 'EXPERTS'
  | 'MULTIBENEFITS'
  | 'FREE'
  | 'PRO'
  | 'ENTERPRISE'
  | 'UNKNOWN';

export type ServiceConditionCode =
  | 'GOVERNMENT_FEES_NOT_INCLUDED'
  | 'ADDON_NOT_IN_BASE_MONTHLY_FEE'
  | 'ACTIVE_CUSTOMERS_ONLY'
  | 'RETROACTIVE_PERIOD_NOT_INCLUDED'
  | 'EXPERTS_HONORARIUM_WAIVER'
  | 'EXPERTS_NO_RETROACTIVE_WAIVER'
  | 'MUNICIPAL_DIGITAL_DEPENDENCY'
  | 'PHYSICAL_PROTOCOL_CUSTOMER_ACTION';

export type ServiceConditionSeverity = 'INFO' | 'WARNING' | 'BLOCKER';

export type ServiceCondition = {
  code: ServiceConditionCode;
  severity: ServiceConditionSeverity;
  message: string;
  serviceId?: string;
};

export type MicroServiceDefinition = {
  id: string;
  name: string;
  notes?: string[];
  governmentFeesMayApply?: boolean;
  addOnService?: boolean;
  expertsHonorariumWaivable?: boolean;
  retroactiveSensitive?: boolean;
  municipalDependency?: boolean;
  physicalProtocolMayApply?: boolean;
  activeCustomersOnly?: boolean;
};

export type MacroServiceDefinition = {
  id: number;
  name: string;
  description: string;
  microServices: MicroServiceDefinition[];
};

export type ServiceEvaluationInput = {
  macroServiceIds?: number[];
  serviceIds?: string[];
  plan?: string;
  activeCustomer?: boolean;
  contractedAt?: string;
  eventDate?: string;
  periodStart?: string;
  municipalityDigital?: boolean;
  physicalProtocolRequired?: boolean;
};

export type EvaluatedMicroService = MicroServiceDefinition & {
  macroServiceId: number;
  macroServiceName: string;
};

export type ServiceEvaluationResult = {
  status: 'OK';
  plan: BcostPlan;
  selectedServices: EvaluatedMicroService[];
  conditions: ServiceCondition[];
  summary: {
    totalServices: number;
    blockers: number;
    warnings: number;
    infos: number;
    requiresHumanReview: boolean;
  };
  generatedAt: string;
};
