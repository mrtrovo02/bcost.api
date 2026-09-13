import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { PayrollService } from './payroll.service.js';

describe('PayrollService external sync', () => {
  let service: PayrollService;
  let prisma: {
    payroll: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    invoice: {
      aggregate: jest.Mock;
    };
    withRlsCompanyContext: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      payroll: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      invoice: {
        aggregate: jest.fn(),
      },
      withRlsCompanyContext: jest
        .fn()
        .mockImplementation(async (_companyId, callback) => callback(prisma)),
    };

    service = new PayrollService(prisma as unknown as PrismaService);
  });

  it('sincroniza folha externa como upsert idempotente', async () => {
    prisma.payroll.findFirst.mockResolvedValue(null);
    prisma.payroll.create.mockResolvedValue({
      id: 'payroll-1',
      companyId: 'company-1',
      month: 8,
      year: 2026,
      totalAmount: new Prisma.Decimal(12500.75),
    });

    const result = await service.syncExternalPayrollRecord('company-1', {
      month: 8,
      year: 2026,
      salariesAmount: 9500,
      proLaboreAmount: 3000.75,
      source: 'DOMINIO',
      externalReference: 'folha-2026-08',
    });

    expect(prisma.payroll.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        month: 8,
        year: 2026,
        totalAmount: new Prisma.Decimal(12500.75),
        salariesAmount: new Prisma.Decimal(9500),
        proLaboreAmount: new Prisma.Decimal(3000.75),
      },
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(result.status).toBe('synced');
    expect(result.source).toBe('DOMINIO');
    expect(result.externalReference).toBe('folha-2026-08');
  });

  it('recusa sincronizacao externa sem valor total apuravel', async () => {
    await expect(
      service.syncExternalPayrollRecord('company-1', {
        month: 8,
        year: 2026,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.payroll.create).not.toHaveBeenCalled();
    expect(prisma.payroll.update).not.toHaveBeenCalled();
  });

  it('lista histórico de folha dentro do contexto RLS', async () => {
    await service.getCompanyPayrollHistory('company-1');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prisma.payroll.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
    });
  });

  it('calcula diagnóstico de Fator R de folha dentro do contexto RLS', async () => {
    prisma.invoice.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(120000) },
    });
    prisma.payroll.aggregate.mockResolvedValueOnce({
      _sum: { totalAmount: new Prisma.Decimal(36000) },
    });

    const result = await service.getFactorRDiagnostics('company-1', 8, 2026);

    expect(result.diagnostico).toMatchObject({
      fatorR: 30,
      isEligibleAnexoIII: true,
      valorNecessarioParaAtingir28: 0,
    });
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-1',
        status: 'NORMAL',
      }),
      _sum: { amount: true },
    });
    expect(prisma.payroll.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-1',
      }),
      _sum: { totalAmount: true },
    });
  });

  it('calcula estatísticas de folha dentro do contexto RLS', async () => {
    prisma.payroll.findMany.mockResolvedValueOnce([
      {
        year: 2026,
        month: 8,
        totalAmount: new Prisma.Decimal(12000),
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
      {
        year: 2026,
        month: 7,
        totalAmount: new Prisma.Decimal(8000),
        createdAt: new Date('2026-07-31T00:00:00.000Z'),
      },
    ]);

    const result = await service.getPayrollStats('company-1');

    expect(result.resumo).toEqual({
      ultimoLancamento: 12000,
      mediaAnual: 10000,
      totalAcumulado: 20000,
    });
    expect(prisma.payroll.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
    });
  });
});
