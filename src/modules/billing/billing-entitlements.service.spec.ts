import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingEntitlementsService,
  type AuthUser,
  type FeatureDefinition,
  type LimitKey,
  type PlanLevel,
} from './billing-entitlements.service.js';
import { PrismaService } from '#database/prisma.service.js';

type MockPrismaService = {
  company: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
};

describe('BillingEntitlementsService', () => {
  let service: BillingEntitlementsService;
  let prismaMock: MockPrismaService;

  const mockCompany = {
    id: 'company-uuid-123',
    name: 'Empresa Teste LTDA',
    cnpj: '12345678000195',
    taxRegime: 'SIMPLES_NACIONAL',
    active: true,
    planLevel: 'PRO',
    settings: {
      billing: {
        lastPlanChangeAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };

  const toRecord = (value: unknown): Record<string, unknown> => {
    expect(value).toEqual(expect.any(Object));
    return value as Record<string, unknown>;
  };

  const toStringArray = (value: unknown): string[] => {
    expect(Array.isArray(value)).toBe(true);
    return value as string[];
  };

  const toFeatures = (value: unknown): FeatureDefinition[] => {
    expect(Array.isArray(value)).toBe(true);
    return value as FeatureDefinition[];
  };

  beforeEach(async () => {
    prismaMock = {
      company: {
        findFirst: jest.fn().mockResolvedValue(mockCompany),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...mockCompany,
              ...data,
            }),
          ),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-log-uuid' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingEntitlementsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<BillingEntitlementsService>(
      BillingEntitlementsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEntitlements', () => {
    it('deve retornar os direitos e limites do plano PRO corretamente', async () => {
      const result = toRecord(await service.getEntitlements('company-uuid-123'));
      const limits = toRecord(result.limits);
      const enabledFeatures = toStringArray(result.enabledFeatures);
      const lockedFeatures = toStringArray(result.lockedFeatures);

      expect(result.status).toBe('OK');
      expect(result.planLevel).toBe('PRO');
      expect(limits.invoicesPerMonth).toBe(500);
      expect(limits.users).toBe(10);
      expect(enabledFeatures).toContain('banking.reconciliation');
      expect(lockedFeatures).toContain('ai.copilot');
    });

    it('deve expor prontidão comercial e guardrails jurídicos por feature', async () => {
      const result = toRecord(await service.getEntitlements('company-uuid-123'));
      const features = toFeatures(result.features);

      expect(features).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'fiscal.diagnostics',
            moduleSlug: 'tax-scenarios',
            marketReadiness: 'SELLABLE',
          }),
          expect.objectContaining({
            key: 'accounting.entries',
            moduleSlug: 'accounting-entries',
            marketReadiness: 'ROADMAP_LOCKED',
            commercialGuardrail: expect.stringContaining(
              'Não vender como escrituração contábil oficial',
            ),
          }),
          expect.objectContaining({
            key: 'digital.certificates',
            moduleSlug: 'digital-certificates',
            marketReadiness: 'ROADMAP_LOCKED',
          }),
          expect.objectContaining({
            key: 'ai.copilot',
            marketReadiness: 'ROADMAP_LOCKED',
            commercialGuardrail: expect.stringContaining(
              'Não vender como automação fiscal autônoma',
            ),
          }),
        ]),
      );
    });

    it('deve lançar NotFoundException quando a empresa não for encontrada', async () => {
      prismaMock.company.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getEntitlements('company-inexistente'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve bloquear acesso de usuário pertencente a outra empresa', async () => {
      const user = {
        companyId: 'outra-empresa-uuid',
        role: 'MEMBER',
      };

      await expect(
        service.getEntitlements('company-uuid-123', user),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('checkFeature', () => {
    it('deve permitir funcionalidade disponível para o plano da empresa', async () => {
      const result = toRecord(await service.checkFeature(
        'company-uuid-123',
        'banking.reconciliation',
      ));

      expect(result.allowed).toBe(true);
      expect(result.status).toBe('ALLOWED');
      expect(toRecord(result.feature).marketReadiness).toBe('SELLABLE');
    });

    it('deve bloquear funcionalidade que exige plano superior (ENTERPRISE)', async () => {
      const result = toRecord(await service.checkFeature(
        'company-uuid-123',
        'ai.copilot',
      ));

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('LOCKED');
      expect(toRecord(result.feature).marketReadiness).toBe('ROADMAP_LOCKED');
    });

    it('deve bloquear feature ROADMAP_LOCKED mesmo para plano ENTERPRISE', async () => {
      prismaMock.company.findFirst.mockResolvedValueOnce({
        ...mockCompany,
        planLevel: 'ENTERPRISE',
      });

      const result = toRecord(await service.checkFeature(
        'company-uuid-123',
        'digital.certificates',
      ));

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('ROADMAP_LOCKED');
      expect(result.message).toEqual(
        expect.stringContaining('Não prometer automação fiscal baseada em certificado'),
      );
      expect(toRecord(result.feature).marketReadiness).toBe('ROADMAP_LOCKED');
    });

    it('deve liberar feature ASSISTED_BETA por plano com mensagem de operação assistida', async () => {
      const result = toRecord(await service.checkFeature(
        'company-uuid-123',
        'automation.jobs',
      ));

      expect(result.allowed).toBe(true);
      expect(result.status).toBe('ALLOWED');
      expect(result.message).toEqual(
        expect.stringContaining('operação assistida'),
      );
      expect(toRecord(result.feature).marketReadiness).toBe('ASSISTED_BETA');
    });

    it('deve retornar UNKNOWN_FEATURE para chave de feature inexistente', async () => {
      const result = toRecord(await service.checkFeature(
        'company-uuid-123',
        'feature.inexistente',
      ));

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('UNKNOWN_FEATURE');
    });
  });

  describe('checkLimit', () => {
    it('deve retornar ALLOWED quando o uso atual estiver abaixo do limite', async () => {
      const result = toRecord(await service.checkLimit(
        'company-uuid-123',
        'invoicesPerMonth',
        150,
      ));

      expect(result.allowed).toBe(true);
      expect(result.status).toBe('ALLOWED');
      expect(result.remaining).toBe(350);
    });

    it('deve retornar LIMIT_EXCEEDED quando a cota for atingida ou superada', async () => {
      const result = toRecord(await service.checkLimit(
        'company-uuid-123',
        'invoicesPerMonth',
        500,
      ));

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('LIMIT_EXCEEDED');
      expect(result.remaining).toBe(0);
    });

    it('deve lançar BadRequestException para chave de limite inválida', async () => {
      await expect(
        service.checkLimit(
          'company-uuid-123',
          'limiteInvalido' as LimitKey,
          10,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePlan', () => {
    it('deve atualizar o plano da empresa e gerar log de auditoria', async () => {
      const adminUser = {
        id: 'user-admin-1',
        companyId: 'company-uuid-123',
        role: 'OWNER',
      };

      const result = toRecord(await service.updatePlan(
        'company-uuid-123',
        'ENTERPRISE' satisfies PlanLevel,
        adminUser satisfies AuthUser,
        'Upgrade para expansão',
      ));

      expect(result.status).toBe('OK');
      expect(result.oldPlan).toBe('PRO');
      expect(result.newPlan).toBe('ENTERPRISE');
      expect(prismaMock.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'company-uuid-123' },
          data: expect.objectContaining({
            planLevel: 'ENTERPRISE',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalled();
    });

    it('deve negar alteração de plano para papéis sem permissão (ex: MEMBER)', async () => {
      const memberUser = {
        id: 'user-member-1',
        companyId: 'company-uuid-123',
        role: 'MEMBER',
      };

      await expect(
        service.updatePlan(
          'company-uuid-123',
          'ENTERPRISE' satisfies PlanLevel,
          memberUser satisfies AuthUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
