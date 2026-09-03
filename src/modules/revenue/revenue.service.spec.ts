import { ContractStatus, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RevenueService } from './revenue.service.js';

describe('RevenueService compatibility endpoints', () => {
  let service: RevenueService;
  let prisma: {
    invoice: {
      aggregate: jest.Mock;
    };
    contract: {
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    payroll: {
      aggregate: jest.Mock;
    };
    withRlsCompanyContext: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00.000Z'));

    prisma = {
      invoice: {
        aggregate: jest.fn(),
      },
      contract: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
      payroll: {
        aggregate: jest.fn(),
      },
      withRlsCompanyContext: jest
        .fn()
        .mockImplementation(async (_companyId, callback) => callback(prisma)),
    };

    service = new RevenueService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calcula estatisticas de receita com dados reais agregados', async () => {
    prisma.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(830000) } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(120000) } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(100000) } });
    prisma.contract.aggregate.mockResolvedValueOnce({
      _count: { id: 8 },
      _sum: { amount: new Prisma.Decimal(75000) },
    });

    const result = await service.getRevenueStats('company-1');

    expect(result).toMatchObject({
      totalRevenue: 830000,
      projectedRevenue: 900000,
      growthRate: 20,
      activeContracts: 8,
      period: {
        year: 2026,
        currentMonth: 8,
        current: '2026-08',
        previous: '2026-07',
      },
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-1',
        status: InvoiceStatus.NORMAL,
        deletedAt: null,
      }),
      _sum: { amount: true },
    });
  });

  it('lista contratos de receita por empresa sem removidos logicamente', async () => {
    const contracts = [
      {
        id: 'contract-1',
        companyId: 'company-1',
        description: 'Mensalidade recorrente',
      },
    ];
    prisma.contract.findMany.mockResolvedValueOnce(contracts);

    await expect(service.getRevenueContracts('company-1')).resolves.toBe(
      contracts,
    );
    expect(prisma.contract.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        deletedAt: null,
      },
      include: {
        customer: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
  });

  it('calcula Fator R com receita e folha dentro do contexto RLS', async () => {
    prisma.invoice.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(1200000) },
    });
    prisma.payroll.aggregate.mockResolvedValueOnce({
      _sum: { totalAmount: new Prisma.Decimal(360000) },
    });

    const result = await service.getFactorR('company-1');

    expect(result).toMatchObject({
      value: 0.3,
      isEligibleForAnexoIII: true,
      revenueLast12Months: 1200000,
      payrollLast12Months: 360000,
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-1',
        status: InvoiceStatus.NORMAL,
        deletedAt: null,
      }),
      _sum: { amount: true },
    });
    expect(prisma.payroll.aggregate).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
      },
      _sum: { totalAmount: true },
    });
  });
});
