'use strict';

import { EnterpriseModulesService } from './enterprise-modules.service.js';
import { PrismaService } from '../../database/prisma.service.js';

const createService = (): EnterpriseModulesService =>
  new EnterpriseModulesService({} as PrismaService);

type EnterpriseModelMock = {
  findMany: jest.Mock<Promise<unknown[]>, [Record<string, unknown>]>;
  count: jest.Mock<Promise<number>, [Record<string, unknown>]>;
};

const createModelMock = (items: unknown[], count: number): EnterpriseModelMock => ({
  findMany: jest.fn<Promise<unknown[]>, [Record<string, unknown>]>().mockResolvedValue(items),
  count: jest.fn<Promise<number>, [Record<string, unknown>]>().mockResolvedValue(count),
});

describe('EnterpriseModulesService', () => {
  it('returns roadmap payload for mapped modules without Prisma persistence yet', async () => {
    const service = createService();

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
    const service = createService();

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
    const service = createService();

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
    const service = createService();

    const [auditIntelligence, operationalWorkflows, consulting] =
      await Promise.all([
        service.list('audit-intelligence', '00000000-0000-0000-0000-000000000001', {}),
        service.list(
          'operational-workflows',
          '00000000-0000-0000-0000-000000000001',
          {},
        ),
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
    expect(operationalWorkflows).toMatchObject({
      slug: 'operational-workflows',
      status: 'OK_ROADMAP',
      summary: {
        endpoint: '/operations/workflows',
        canonicalOwner: 'operational-workflows',
        automationBoundary: 'ASSISTED_AUTOMATION',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('dossiê operacional'),
          expect.stringContaining('portal público'),
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

  it('maps tax scenarios to the universal enterprise roadmap instead of returning 404', async () => {
    const service = createService();

    const result = await service.list(
      'tax-scenarios',
      '00000000-0000-0000-0000-000000000001',
      {},
    );

    expect(result).toMatchObject({
      slug: 'tax-scenarios',
      model: 'TaxScenarioSimulation',
      label: 'Simulador Tributário',
      status: 'OK_ROADMAP',
      summary: {
        roadmap: true,
        endpoint: '/tax-scenarios/simulate',
        canonicalOwner: 'tax-scenarios',
        automationBoundary: 'ASSISTED_AUTOMATION',
        operationalGuardrails: expect.arrayContaining([
          expect.stringContaining('estimativas gerenciais'),
          expect.stringContaining('Fator R'),
        ]),
      },
    });
  });

  it('includes roadmap modules in the enterprise catalog', () => {
    const service = createService();

    expect(service.listCatalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'company-formation',
          model: 'CompanyFormation',
          persistence: 'ROADMAP',
          marketReadiness: 'ROADMAP_LOCKED',
          endpoint: '/accounting-platform/setup/readiness',
          canonicalOwner: 'accounting-platform',
          automationBoundary: 'CRC_VALIDATED',
        }),
        expect.objectContaining({
          slug: 'companies',
          model: 'Company',
          persistence: 'PRISMA',
          marketReadiness: 'SELLABLE',
          endpoint: '/enterprise/modules/companies/:companyId',
          canonicalOwner: 'enterprise-modules',
          automationBoundary: 'SOFTWARE_ONLY',
        }),
      ]),
    );
  });

  it('enriches the enterprise catalog with roadmap governance metadata', () => {
    const service = createService();
    const catalog = service.listCatalog();
    const roadmapItems = catalog.filter((item) => item.persistence === 'ROADMAP');

    expect(roadmapItems.length).toBeGreaterThan(0);

    for (const item of roadmapItems) {
      expect(item.endpoint).toMatch(/^\/.+/);
      expect(item.marketReadiness).toMatch(
        /^(ASSISTED_BETA|ROADMAP_LOCKED)$/,
      );
      expect(item.area).toEqual(expect.any(String));
      expect(item.priority).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)$/);
      expect(item.canonicalOwner).toEqual(expect.any(String));
      expect(item.automationBoundary).toMatch(
        /^(SOFTWARE_ONLY|ASSISTED_AUTOMATION|CRC_VALIDATED|HUMAN_LED)$/,
      );
      expect(item.operationalGuardrails?.length).toBeGreaterThan(0);

      if (item.marketReadiness === 'ASSISTED_BETA') {
        expect(item.launchGate).toMatchObject({
          status: 'WARN',
          canSell: true,
        });
        expect(item.launchGate.requiredEvidence).toContain(
          'revisão CRC antes da contratação',
        );
        expect(item.launchGate.warnings.join(' ')).toContain(
          'diagnóstico assistido',
        );
      } else {
        expect(item.launchGate).toMatchObject({
          status: 'BLOCK',
          canSell: false,
        });
        expect(item.launchGate.blockers).toContain(
          'módulo em roadmap não pode ser vendido como automação pronta',
        );
      }
    }
  });

  it('marks persisted catalog modules as sellable market items', () => {
    const service = createService();
    const catalog = service.listCatalog();
    const persistedItems = catalog.filter((item) => item.persistence === 'PRISMA');

    expect(persistedItems.length).toBeGreaterThan(0);

    for (const item of persistedItems) {
      expect(item.marketReadiness).toBe('SELLABLE');
      expect(item.endpoint).toBe(`/enterprise/modules/${item.slug}/:companyId`);
      expect(item.canonicalOwner).toBe('enterprise-modules');
      expect(item.automationBoundary).toBe('SOFTWARE_ONLY');
      expect(item.launchGate).toMatchObject({
        status: 'PASS',
        canSell: true,
      });
      expect(item.launchGate.requiredEvidence).toContain('tenant isolation por companyId');
    }
  });

  it('returns exact Prisma count instead of page size as module total', async () => {
    const companyModel = createModelMock(
      [
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Empresa A',
          cnpj: '11222333000144',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      37,
    );
    const service = new EnterpriseModulesService({
      company: companyModel,
    } as unknown as PrismaService);

    const result = await service.list(
      'companies',
      '00000000-0000-0000-0000-000000000001',
      { limit: 1, offset: 20 },
    );

    expect(result.total).toBe(37);
    expect(result.items).toHaveLength(1);
    expect(companyModel.count).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-0000-0000-000000000001',
        deletedAt: null,
      },
    });
  });

  it('marks module health as degraded when Prisma count fails', async () => {
    const companyModel = createModelMock([], 0);
    companyModel.count.mockRejectedValueOnce(new Error('database unavailable'));
    const service = new EnterpriseModulesService({
      company: companyModel,
    } as unknown as PrismaService);

    const result = await service.health(
      'companies',
      '00000000-0000-0000-0000-000000000001',
    );

    expect(result).toMatchObject({
      slug: 'companies',
      status: 'DEGRADED',
      count: 0,
      error: 'Não foi possível contar registros do módulo no Prisma.',
    });
  });

  it('groups enterprise catalog into commercial lanes without selling roadmap as ready', () => {
    const service = createService();
    const catalog = service.listCatalog();
    const lanes = service.listCommercialLanes();
    const modulesInLanes = lanes.flatMap((lane) => lane.modules);

    expect(lanes.map((lane) => lane.id)).toEqual([
      'direct-sale',
      'assisted-validation',
      'blocked-roadmap',
    ]);
    expect(modulesInLanes.map((item) => item.slug).sort()).toEqual(
      catalog.map((item) => item.slug).sort(),
    );

    const directSale = lanes.find((lane) => lane.id === 'direct-sale');
    const assistedValidation = lanes.find((lane) => lane.id === 'assisted-validation');
    const blockedRoadmap = lanes.find((lane) => lane.id === 'blocked-roadmap');

    expect(directSale?.modules.length).toBeGreaterThan(0);
    expect(assistedValidation?.modules.length).toBeGreaterThan(0);
    expect(blockedRoadmap?.modules.length).toBeGreaterThan(0);

    for (const item of directSale?.modules ?? []) {
      expect(item.marketReadiness).toBe('SELLABLE');
      expect(item.persistence).toBe('PRISMA');
      expect(item.launchGate.canSell).toBe(true);
    }

    for (const item of assistedValidation?.modules ?? []) {
      expect(item.marketReadiness).toMatch(/^(ASSISTED_BETA|ROADMAP_LOCKED)$/);
      expect(item.persistence).toBe('ROADMAP');
      expect(item.automationBoundary).toMatch(/^(ASSISTED_AUTOMATION|CRC_VALIDATED)$/);
    }

    expect(assistedValidation?.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'tax-scenarios',
          marketReadiness: 'ASSISTED_BETA',
          launchGate: expect.objectContaining({
            status: 'WARN',
            canSell: true,
          }),
        }),
      ]),
    );

    for (const item of blockedRoadmap?.modules ?? []) {
      expect(item.marketReadiness).toBe('ROADMAP_LOCKED');
      expect(item.persistence).toBe('ROADMAP');
      expect(item.launchGate.canSell).toBe(false);
    }

    for (const lane of lanes) {
      expect(lane.summary.total).toBe(lane.modules.length);
      expect(lane.summary.critical).toBe(
        lane.modules.filter((item) => item.priority === 'CRITICAL').length,
      );
      expect(lane.summary.high).toBe(
        lane.modules.filter((item) => item.priority === 'HIGH').length,
      );
      expect(lane.summary.regulated).toBe(
        lane.modules.filter((item) =>
          ['ASSISTED_AUTOMATION', 'CRC_VALIDATED', 'HUMAN_LED'].includes(
            item.automationBoundary ?? '',
          ),
        ).length,
      );
    }
  });
});
