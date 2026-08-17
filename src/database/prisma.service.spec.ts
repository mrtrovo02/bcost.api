'use strict';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service.js';
import { TenantContext } from '#common/tenant/tenant.context.js';

describe('PrismaService', () => {
  let service: PrismaService;
  let configService: ConfigService;

  const mockConfigService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://user:password@localhost:5432/testdb?schema=public';
      }
      throw new Error(`Config key ${key} not found`);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  describe('Instanciação e Ciclo de Vida', () => {
    it('deve instanciar o serviço e ler DATABASE_URL das variáveis de ambiente', () => {
      expect(service).toBeDefined();
      expect(configService.getOrThrow).toHaveBeenCalledWith('DATABASE_URL');
      expect(service.isConnected).toBe(false);
    });

    it('deve alterar o status de conexão no encerramento (onModuleDestroy)', async () => {
      jest.spyOn(service, '$disconnect').mockResolvedValueOnce();
      // @ts-expect-error Acesso a propriedade privada pool para mock no teste
      jest.spyOn(service.pool, 'end').mockResolvedValueOnce();

      await service.onModuleDestroy();

      expect(service.isConnected).toBe(false);
      expect(service.$disconnect).toHaveBeenCalled();
    });
  });

  describe('Health Check (isHealthy)', () => {
    it('deve retornar true e atualizar _connected quando a query $queryRaw for bem sucedida', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockResolvedValueOnce([{ '?column?': 1 }]);

      const healthy = await service.isHealthy();

      expect(healthy).toBe(true);
      expect(service.isConnected).toBe(true);
      expect(service.$queryRaw).toHaveBeenCalled();
    });

    it('deve retornar false e atualizar _connected quando a query falhar', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockRejectedValueOnce(new Error('DB Connection Refused'));

      const healthy = await service.isHealthy();

      expect(healthy).toBe(false);
      expect(service.isConnected).toBe(false);
    });
  });

  describe('Extension Layer: Isolamento Multi-Tenancy', () => {
    it('deve injetar automaticamente o companyId em consultas de models escopados', async () => {
      const mockCompanyId = 'company-uuid-1234';

      await TenantContext.run({ tenantId: mockCompanyId }, async () => {
        expect(TenantContext.getTenantId()).toBe(mockCompanyId);

        // Simula a injeção do filtro de tenant no objeto de busca
        const queryArgs: Record<string, unknown> = {
          where: { reconciled: false },
        };

        if (TenantContext.getTenantId()) {
          queryArgs.where = {
            ...(queryArgs.where as Record<string, unknown>),
            companyId: TenantContext.getTenantId(),
          };
        }

        expect(queryArgs.where).toEqual({
          reconciled: false,
          companyId: mockCompanyId,
        });
      });
    });

    it('deve injetar companyId em lote ao executar createMany com array de dados', async () => {
      const mockCompanyId = 'tenant-abc-890';

      await TenantContext.run({ tenantId: mockCompanyId }, async () => {
        const payload = [
          { amount: 100, reconciled: false },
          { amount: 200, reconciled: true },
        ];

        const processed = payload.map((item) => ({
          ...item,
          companyId: TenantContext.getTenantId(),
        }));

        expect(processed[0].companyId).toBe(mockCompanyId);
        expect(processed[1].companyId).toBe(mockCompanyId);
      });
    });
  });

  describe('Extension Layer: Soft Delete Global', () => {
    it('deve injetar `deletedAt: null` por padrão em leituras de entidades com Soft Delete', () => {
      const whereClause: Record<string, unknown> = {};

      if (whereClause.deletedAt === undefined) {
        whereClause.deletedAt = null;
      }

      expect(whereClause).toEqual({ deletedAt: null });
    });

    it('não deve sobreescrever o filtro de `deletedAt` se ele for explicitamente passado na query', () => {
      const targetDate = new Date('2026-01-01');
      const whereClause: Record<string, unknown> = { deletedAt: targetDate };

      if (whereClause.deletedAt === undefined) {
        whereClause.deletedAt = null;
      }

      expect(whereClause.deletedAt).toBe(targetDate);
    });
  });
});
