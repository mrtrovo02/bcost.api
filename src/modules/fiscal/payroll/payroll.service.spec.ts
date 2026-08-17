import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { PayrollService } from './payroll.service.js';

describe('PayrollService external sync', () => {
  let service: PayrollService;
  let prisma: {
    payroll: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    invoice: {
      aggregate: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      payroll: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        aggregate: jest.fn(),
      },
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
});
