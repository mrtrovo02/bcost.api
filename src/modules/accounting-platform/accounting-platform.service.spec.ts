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
    expect(coverage.summary.blockers).toBeGreaterThan(0);
    expect(coverage.summary.warnings).toBeGreaterThan(0);
    expect(coverage.summary.p0 + coverage.summary.p1).toBeGreaterThan(0);
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

  it('expõe lacunas acionáveis antes de vender serviços não prontos', () => {
    const coverage = service.coverage();
    const formation = coverage.items.find((item) => item.id === 'company-formation-engine');
    const issuer = coverage.items.find((item) => item.id === 'universal-nfse-issuer');

    expect(formation?.readinessGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MODULE_NOT_IMPLEMENTED',
          severity: 'BLOCKER',
        }),
      ]),
    );
    expect(issuer?.readinessGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PARTNER_REQUIRED',
          severity: 'BLOCKER',
        }),
      ]),
    );
    expect(issuer?.nextActions?.length).toBeGreaterThan(0);
  });

  it('prioriza lacunas críticas como backlog executivo', () => {
    const coverage = service.coverage();
    const nfse = coverage.items.find((item) => item.id === 'universal-nfse-issuer');
    const matrix = coverage.items.find((item) => item.id === 'service-delivery-matrix');

    expect(nfse?.priorityTier).toBe('P0');
    expect(nfse?.priorityScore).toBeGreaterThanOrEqual(80);
    expect(matrix?.priorityTier).toBe('P3');
  });
});
