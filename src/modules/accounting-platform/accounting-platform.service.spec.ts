'use strict';

import { AccountingPlatformService } from './accounting-platform.service.js';

describe('AccountingPlatformService', () => {
  let service: AccountingPlatformService;

  beforeEach(() => {
    service = new AccountingPlatformService();
  });

  it('mapeia os quatro blocos estrategicos de accounting as a service', () => {
    const coverage = service.coverage();
    const blocks = new Set(coverage.items.map((item) => item.block));

    expect(blocks).toEqual(
      new Set([
        'ONBOARDING_LEGALIZATION',
        'RECURRING_ACCOUNTING_TAX',
        'FINTECH_VALUE_ADDED',
        'SERVICE_ARCHITECTURE',
      ]),
    );
    expect(coverage.summary.total).toBe(10);
    expect(coverage.summary.crcValidated).toBeGreaterThanOrEqual(4);
  });

  it('declara capacidades criticas para rotinas reguladas e fintech', () => {
    const coverage = service.coverage();
    const das = coverage.items.find((item) => item.id === 'simples-tax-engine');
    const banking = coverage.items.find((item) => item.id === 'embedded-pj-account');

    expect(das?.requiredCapabilities).toEqual(
      expect.arrayContaining([
        'DIGITAL_CERTIFICATE',
        'OFFICIAL_PORTAL_ACCESS',
        'CRC_ACCOUNTANT',
        'AUDIT_EVIDENCE_STORE',
      ]),
    );
    expect(banking?.requiredCapabilities).toEqual(
      expect.arrayContaining(['BAAS_PARTNER', 'OPEN_FINANCE_PROVIDER']),
    );
  });
});
