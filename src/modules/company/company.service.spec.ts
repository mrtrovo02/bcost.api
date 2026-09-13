import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CompanyRole, TaxRegime } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CompanyService } from './company.service.js';

type PrismaMock = {
  $transaction: jest.Mock;
  withRlsCompanyContext: jest.Mock;
  company: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  companyUser: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
};

describe('CompanyService', () => {
  let service: CompanyService;
  let prisma: PrismaMock;

  const userId = 'user-123';
  const company = {
    id: 'company-123',
    name: 'Empresa Real LTDA',
    cnpj: '11222333000181',
    taxRegime: TaxRegime.SIMPLES_NACIONAL,
    cnae: null,
    anexo: 3,
    active: true,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (callback: (tx: PrismaMock) => unknown) =>
        callback(prisma),
      ),
      withRlsCompanyContext: jest.fn(
        async (
          _companyId: string,
          callback: (tx: PrismaMock) => unknown,
        ) => callback(prisma),
      ),
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(company),
        findMany: jest.fn().mockResolvedValue([company]),
        create: jest.fn().mockResolvedValue(company),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...company, ...data }),
          ),
      },
      companyUser: {
        create: jest.fn().mockResolvedValue({
          userId,
          companyId: company.id,
          role: CompanyRole.OWNER,
        }),
        findFirst: jest.fn().mockResolvedValue({ role: CompanyRole.OWNER }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-123' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia cadastro com CNPJ invalido antes de persistir', async () => {
    await expect(
      service.create(
        {
          name: 'Empresa Invalida',
          cnpj: '00.000.000/0000-00',
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(prisma.withRlsCompanyContext).not.toHaveBeenCalled();
  });

  it('bloqueia cadastro com CNPJ duplicado normalizado', async () => {
    prisma.company.findUnique.mockResolvedValueOnce(company);

    await expect(
      service.create(
        {
          name: 'Empresa Duplicada',
          cnpj: '11.222.333/0001-81',
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        },
        userId,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { cnpj: '11222333000181' },
    });
  });

  it('cria empresa, vincula owner e registra auditoria na mesma transacao', async () => {
    const result = await service.create(
      {
        name: company.name,
        cnpj: '11.222.333/0001-81',
        taxRegime: TaxRegime.SIMPLES_NACIONAL,
      },
      userId,
    );

    expect(result).toEqual(company);
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
    );
    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: expect.any(String),
          cnpj: '11222333000181',
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        }),
      }),
    );
    expect(prisma.companyUser.create).toHaveBeenCalledWith({
      data: {
        userId,
        companyId: company.id,
        role: CompanyRole.OWNER,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'COMPANY_CREATED',
          module: 'COMPANY',
          entity: 'Company',
          entityId: company.id,
          statusCode: 201,
        }),
      }),
    );
  });

  it('lista apenas empresas ativas vinculadas ao usuario com limite e payload publico', async () => {
    await service.findAll(userId);

    expect(prisma.company.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        deletedAt: null,
        users: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        taxRegime: true,
        cnae: true,
        anexo: true,
        active: true,
        planLevel: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  });

  it('nega update para usuario sem papel de gestao', async () => {
    prisma.companyUser.findFirst.mockResolvedValueOnce({
      role: CompanyRole.VIEWER,
    });

    await expect(
      service.update(company.id, { name: 'Novo Nome' }, userId),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.company.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('atualiza empresa e registra before/after no AuditLog', async () => {
    const result = await service.update(
      company.id,
      { name: 'Novo Nome', anexo: 4 },
      userId,
    );

    expect(result).toMatchObject({ name: 'Novo Nome', anexo: 4 });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'COMPANY_UPDATED',
          companyId: company.id,
          payload: expect.objectContaining({
            before: expect.objectContaining({
              company: expect.objectContaining({ name: company.name }),
            }),
            after: expect.objectContaining({
              company: expect.objectContaining({ name: 'Novo Nome' }),
            }),
            changedFields: ['name', 'anexo'],
          }),
        }),
      }),
    );
  });

  it('desativa empresa e registra auditoria', async () => {
    const result = await service.delete(company.id, userId);

    expect(result).toMatchObject({ active: false });
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: company.id },
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'COMPANY_DEACTIVATED',
          companyId: company.id,
          entityId: company.id,
          statusCode: 200,
        }),
      }),
    );
  });
});
