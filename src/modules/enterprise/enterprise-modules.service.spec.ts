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
