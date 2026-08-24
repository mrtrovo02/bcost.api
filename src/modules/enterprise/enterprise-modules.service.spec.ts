'use strict';

import { EnterpriseModulesService } from './enterprise-modules.service.js';

describe('EnterpriseModulesService', () => {
  it('returns roadmap payload for mapped modules without Prisma persistence yet', async () => {
    const service = new EnterpriseModulesService({} as any);

    const result = await service.list(
      'company-formation',
      '00000000-0000-0000-0000-000000000001',
      { limit: 25 },
    );

    expect(result).toMatchObject({
      slug: 'company-formation',
      model: 'CompanyFormation',
      label: 'Abertura de Empresa',
      status: 'OK_ROADMAP',
      total: 0,
      limit: 25,
      hasMore: false,
      summary: {
        roadmap: true,
        endpoint: '/accounting-platform/setup/readiness',
        canonicalOwner: 'accounting-platform',
        automationBoundary: 'CRC_VALIDATED',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('Não prometer abertura 100% automática'),
          expect.stringContaining('dossiê auditável'),
        ]),
      },
    });
  });

  it('keeps banking products aligned with the enterprise banking canonical route', async () => {
    const service = new EnterpriseModulesService({} as any);

    const result = await service.list(
      'banking-products',
      '00000000-0000-0000-0000-000000000001',
      { limit: 25 },
    );

    expect(result).toMatchObject({
      slug: 'banking-products',
      model: 'BankingProduct',
      label: 'Banking e Fintech',
      status: 'OK_ROADMAP',
      summary: {
        roadmap: true,
        endpoint: '/banking/enterprise/products',
        canonicalOwner: 'banking-enterprise',
        automationBoundary: 'ASSISTED_AUTOMATION',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('parceiro BaaS homologado'),
          expect.stringContaining('empresa/tenant'),
        ]),
      },
    });
  });

  it('adds regulated accounting, fiscal and payroll guardrails to roadmap modules', async () => {
    const service = new EnterpriseModulesService({} as any);

    const [balanceSheet, spedFiscal, payrollLifecycle] = await Promise.all([
      service.list('balance-sheet', '00000000-0000-0000-0000-000000000001', {}),
      service.list('sped-fiscal', '00000000-0000-0000-0000-000000000001', {}),
      service.list('payroll-lifecycle', '00000000-0000-0000-0000-000000000001', {}),
    ]);

    expect(balanceSheet).toMatchObject({
      summary: {
        canonicalOwner: 'accounting-enterprise',
        automationBoundary: 'CRC_VALIDATED',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('demonstração contábil oficial'),
          expect.stringContaining('trilha de auditoria'),
        ]),
      },
    });
    expect(spedFiscal).toMatchObject({
      summary: {
        canonicalOwner: 'fiscal-obligations-enterprise',
        automationBoundary: 'CRC_VALIDATED',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('protocolo oficial'),
          expect.stringContaining('portal oficial'),
        ]),
      },
    });
    expect(payrollLifecycle).toMatchObject({
      summary: {
        canonicalOwner: 'payroll-enterprise',
        automationBoundary: 'CRC_VALIDATED',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('eSocial'),
          expect.stringContaining('Pró-labore'),
        ]),
      },
    });
  });

  it('keeps automation and consulting roadmap boundaries explicit', async () => {
    const service = new EnterpriseModulesService({} as any);

    const [auditIntelligence, consulting] = await Promise.all([
      service.list('audit-intelligence', '00000000-0000-0000-0000-000000000001', {}),
      service.list('consulting-services', '00000000-0000-0000-0000-000000000001', {}),
    ]);

    expect(auditIntelligence).toMatchObject({
      summary: {
        canonicalOwner: 'audit-intelligence-enterprise',
        automationBoundary: 'SOFTWARE_ONLY',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('não substitui aprovação humana'),
        ]),
      },
    });
    expect(consulting).toMatchObject({
      summary: {
        canonicalOwner: 'accounting-platform',
        automationBoundary: 'HUMAN_LED',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('serviços liderados por especialistas'),
        ]),
      },
    });
  });

  it('includes roadmap modules in the enterprise catalog', () => {
    const service = new EnterpriseModulesService({} as any);

    expect(service.listCatalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'company-formation',
          model: 'CompanyFormation',
          persistence: 'ROADMAP',
        }),
        expect.objectContaining({
          slug: 'companies',
          model: 'Company',
          persistence: 'PRISMA',
        }),
      ]),
    );
  });
});
