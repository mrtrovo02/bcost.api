import { PrismaService } from '../../../database/prisma.service.js';
import { RevenueRepository } from './revenue.repository.js';

interface RevenueRepositoryPrismaMock {
  invoice: {
    aggregate: jest.Mock<Promise<unknown>, [unknown]>;
  };
  payroll: {
    aggregate: jest.Mock<Promise<unknown>, [unknown]>;
  };
  taxCalculation: {
    upsert: jest.Mock<Promise<unknown>, [unknown]>;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: RevenueRepositoryPrismaMock) => Promise<unknown>]
  >;
}

function createPrismaMock(): RevenueRepositoryPrismaMock {
  const prisma = {
    invoice: {
      aggregate: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        _sum: { amount: 120000 },
      }),
    },
    payroll: {
      aggregate: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        _sum: {
          totalAmount: 36000,
          salariesAmount: 24000,
          proLaboreAmount: 12000,
        },
      }),
    },
    taxCalculation: {
      upsert: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'tax-calculation-001',
      }),
    },
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: RevenueRepositoryPrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

describe('RevenueRepository tenant isolation', () => {
  let prisma: RevenueRepositoryPrismaMock;
  let repository: RevenueRepository;

  beforeEach(() => {
    prisma = createPrismaMock();
    repository = new RevenueRepository(prisma as unknown as PrismaService);
  });

  it('busca receita dos ultimos 12 meses dentro do contexto RLS', async () => {
    const referenceDate = new Date('2026-08-31T00:00:00.000Z');

    await repository.getRevenueLast12Months('company-001', referenceDate);

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: {
        companyId: 'company-001',
        status: 'NORMAL',
        issuedAt: {
          gte: expect.any(Date),
          lte: referenceDate,
        },
      },
      _sum: { amount: true },
    });
  });

  it('busca folha dos ultimos 12 meses dentro do contexto RLS', async () => {
    const referenceDate = new Date('2026-08-31T00:00:00.000Z');

    await repository.getPayrollLast12Months('company-001', referenceDate);

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.payroll.aggregate).toHaveBeenCalledWith({
      where: {
        companyId: 'company-001',
        createdAt: {
          gte: expect.any(Date),
          lte: referenceDate,
        },
      },
      _sum: {
        totalAmount: true,
        salariesAmount: true,
        proLaboreAmount: true,
      },
    });
  });

  it('grava calculo tributario dentro do contexto RLS', async () => {
    await repository.upsertTaxCalculation({
      companyId: 'company-001',
      month: 8,
      year: 2026,
      totalAmount: 120000,
      fatorR: 0.3,
    });

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.taxCalculation.upsert).toHaveBeenCalledWith({
      where: {
        companyId_month_year: {
          companyId: 'company-001',
          month: 8,
          year: 2026,
        },
      },
      update: {
        totalAmount: 120000,
        fatorR: 0.3,
      },
      create: {
        companyId: 'company-001',
        month: 8,
        year: 2026,
        totalAmount: 120000,
        fatorR: 0.3,
      },
    });
  });
});
