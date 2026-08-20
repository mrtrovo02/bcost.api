import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BillingEntitlementsService } from './billing-entitlements.service.js';
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
      const result = (await service.getEntitlements(
        'company-uuid-123',
      )) as Record<string, any>;

      expect(result.status).toBe('OK');
      expect(result.planLevel).toBe('PRO');
      expect(result.limits.invoicesPerMonth).toBe(500);
      expect(result.limits.users).toBe(10);
      expect(result.enabledFeatures).toContain('banking.reconciliation');
      expect(result.lockedFeatures).toContain('ai.copilot');
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
        service.getEntitlements('company-uuid-123', user as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('checkFeature', () => {
    it('deve permitir funcionalidade disponível para o plano da empresa', async () => {
      const result = (await service.checkFeature(
        'company-uuid-123',
        'banking.reconciliation',
      )) as Record<string, any>;

      expect(result.allowed).toBe(true);
      expect(result.status).toBe('ALLOWED');
    });

    it('deve bloquear funcionalidade que exige plano superior (ENTERPRISE)', async () => {
      const result = (await service.checkFeature(
        'company-uuid-123',
        'ai.copilot',
      )) as Record<string, any>;

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('LOCKED');
    });

    it('deve retornar UNKNOWN_FEATURE para chave de feature inexistente', async () => {
      const result = (await service.checkFeature(
        'company-uuid-123',
        'feature.inexistente',
      )) as Record<string, any>;

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('UNKNOWN_FEATURE');
    });
  });

  describe('checkLimit', () => {
    it('deve retornar ALLOWED quando o uso atual estiver abaixo do limite', async () => {
      const result = (await service.checkLimit(
        'company-uuid-123',
        'invoicesPerMonth' as any,
        150,
      )) as Record<string, any>;

      expect(result.allowed).toBe(true);
      expect(result.status).toBe('ALLOWED');
      expect(result.remaining).toBe(350);
    });

    it('deve retornar LIMIT_EXCEEDED quando a cota for atingida ou superada', async () => {
      const result = (await service.checkLimit(
        'company-uuid-123',
        'invoicesPerMonth' as any,
        500,
      )) as Record<string, any>;

      expect(result.allowed).toBe(false);
      expect(result.status).toBe('LIMIT_EXCEEDED');
      expect(result.remaining).toBe(0);
    });

    it('deve lançar BadRequestException para chave de limite inválida', async () => {
      await expect(
        service.checkLimit('company-uuid-123', 'limiteInvalido' as any, 10),
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

      const result = (await service.updatePlan(
        'company-uuid-123',
        'ENTERPRISE' as any,
        adminUser as any,
        'Upgrade para expansão',
      )) as Record<string, any>;

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
          'ENTERPRISE' as any,
          memberUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
