'use strict';

import { Injectable } from '@nestjs/common';

export type PublicSettingsResponse = {
  status: 'OK';
  app: {
    name: string;
    edition: string;
    environment: string;
    apiVersion: string;
  };
  features: {
    accountingPlatform: boolean;
    operationalWorkflows: boolean;
    marketSafeOfferings: boolean;
    companyOfferingAssessment: boolean;
    demoFallbackEnabled: boolean;
  };
  security: {
    tenantHeader: string;
    credentialStorageRequired: boolean;
    exposesSecrets: false;
  };
  generatedAt: string;
};

@Injectable()
export class PublicSettingsService {
  getSettings(): PublicSettingsResponse {
    return {
      status: 'OK',
      app: {
        name: 'bCost',
        edition: 'Enterprise',
        environment: process.env.NODE_ENV ?? 'development',
        apiVersion: 'v2',
      },
      features: {
        accountingPlatform: true,
        operationalWorkflows: true,
        marketSafeOfferings: true,
        companyOfferingAssessment: true,
        demoFallbackEnabled: process.env.ENABLE_DEMO_FALLBACK === 'true',
      },
      security: {
        tenantHeader: 'x-company-id',
        credentialStorageRequired: true,
        exposesSecrets: false,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
