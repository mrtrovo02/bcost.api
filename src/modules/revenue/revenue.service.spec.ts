import {
  ContractStatus,
  InvoiceStatus,
  InvoiceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RevenueService } from './revenue.service.js';

describe('RevenueService compatibility endpoints', () => {
  let service: RevenueService;
  let prisma: {
    invoice: {
      aggregate: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    contract: {
      aggregate: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    payroll: {
      aggregate: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    withRlsCompanyContext: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00.000Z'));

    prisma = {
      invoice: {
        aggregate: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      contract: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      payroll: {
        aggregate: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
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

  it('processa faturamento mensal dentro do contexto RLS e cria invoice idempotente', async () => {
    prisma.contract.findMany.mockResolvedValueOnce([
      {
        id: 'contract-1',
        companyId: 'company-1',
        customerId: 'customer-1',
        amount: new Prisma.Decimal(500),
        billingDay: 5,
      },
    ]);
    prisma.invoice.findFirst.mockResolvedValueOnce(null);
    prisma.invoice.create.mockResolvedValueOnce({ id: 'invoice-1' });
    prisma.contract.update.mockResolvedValueOnce({ id: 'contract-1' });

    const result = await service.processBillingInternal('company-1', {
      month: 8,
      year: 2026,
      mode: 'MANUAL',
    });

    expect(result.status).toBe('OK');
    expect(result.totals).toMatchObject({
      contractsFound: 1,
      processed: 1,
      created: 1,
      skipped: 0,
      failed: 0,
      amountCreated: 500,
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prisma.contract.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        status: ContractStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-1',
        customerId: 'customer-1',
        type: InvoiceType.SERVICE,
        deletedAt: null,
      }),
      orderBy: {
        issuedAt: 'desc',
      },
    });
    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        customerId: 'customer-1',
        amount: new Prisma.Decimal(500),
        type: InvoiceType.SERVICE,
        status: InvoiceStatus.NORMAL,
        reconciled: false,
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('calcula métricas mensais de receita dentro do contexto RLS', async () => {
    prisma.invoice.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(10000) },
      _count: { id: 3 },
    });
    prisma.invoice.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(120000) },
    });
    prisma.payroll.aggregate.mockResolvedValueOnce({
      _sum: { totalAmount: new Prisma.Decimal(36000) },
    });

    const result = await service.getRevenueMetrics('company-1', 8, 2026);

    expect(result).toMatchObject({
      period: '08/2026',
      totalInvoiced: 10000,
      taxProvision: 1550,
      invoiceCount: 3,
      fiscalIntelligence: {
        isEligibleAnexoIII: true,
      },
    });
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-1',
        status: InvoiceStatus.NORMAL,
        deletedAt: null,
      }),
      _sum: { amount: true },
      _count: { id: true },
    });
  });
});
