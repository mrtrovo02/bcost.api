import { Queue } from 'bullmq';
import { ObligationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { FinanceService } from './finance.service.js';

interface AggregateResult {
  _sum: {
    amount: Prisma.Decimal | null;
  };
}

interface TaxObligationRecord {
  id: string;
  companyId: string;
  status: ObligationStatus;
  dueDate: Date;
  amount: Prisma.Decimal;
}

interface BankTransactionRecord {
  id: string;
}

interface FinancePrismaMock {
  bankTransaction: {
    aggregate: jest.Mock<Promise<AggregateResult>, [unknown]>;
    findFirst: jest.Mock<Promise<BankTransactionRecord | null>, [unknown]>;
    update: jest.Mock<Promise<BankTransactionRecord>, [unknown]>;
  };
  taxObligation: {
    aggregate: jest.Mock<Promise<AggregateResult>, [unknown]>;
    findMany: jest.Mock<Promise<TaxObligationRecord[]>, [unknown]>;
    update: jest.Mock<Promise<TaxObligationRecord>, [unknown]>;
  };
  balanceLock: {
    findUnique: jest.Mock<Promise<unknown>, [unknown]>;
    create: jest.Mock<Promise<unknown>, [unknown]>;
  };
  auditLog: {
    findMany: jest.Mock<Promise<unknown[]>, [unknown]>;
    create: jest.Mock<Promise<unknown>, [unknown]>;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: FinancePrismaMock) => Promise<unknown>]
  >;
  $transaction: jest.Mock<
    Promise<unknown>,
    [(transaction: FinancePrismaMock) => Promise<unknown>]
  >;
}

interface QueueMock {
  add: jest.Mock<Promise<{ id: string }>, [string, unknown, unknown]>;
}

function createPrismaMock(): FinancePrismaMock {
  const prisma = {
    bankTransaction: {
      aggregate: jest
        .fn<Promise<AggregateResult>, [unknown]>()
        .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(1000) } }),
      findFirst: jest.fn<Promise<BankTransactionRecord | null>, [unknown]>(),
      update: jest
        .fn<Promise<BankTransactionRecord>, [unknown]>()
        .mockResolvedValue({ id: 'transaction-001' }),
    },
    taxObligation: {
      aggregate: jest
        .fn<Promise<AggregateResult>, [unknown]>()
        .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(250) } }),
      findMany: jest.fn<Promise<TaxObligationRecord[]>, [unknown]>(),
      update: jest.fn<Promise<TaxObligationRecord>, [unknown]>(),
    },
    balanceLock: {
      findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null),
      create: jest.fn<Promise<unknown>, [unknown]>(),
    },
    auditLog: {
      findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
      create: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'audit-001',
      }),
    },
    $transaction: jest.fn<
      Promise<unknown>,
      [(transaction: FinancePrismaMock) => Promise<unknown>]
    >(async (callback) => callback(prisma)),
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: FinancePrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

function createQueueMock(): QueueMock {
  return {
    add: jest.fn<Promise<{ id: string }>, [string, unknown, unknown]>().mockResolvedValue({
      id: 'job-001',
    }),
  };
}

describe('FinanceService tenant isolation', () => {
  let prisma: FinancePrismaMock;
  let service: FinanceService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new FinanceService(
      prisma as unknown as PrismaService,
      createQueueMock() as unknown as Queue,
    );
  });

  it('calcula resumo financeiro filtrando passivo tributario por empresa', async () => {
    const result = await service.getFinancialHealthSummary('company-001');

    expect(result).toMatchObject({
      cashBalance: 1000,
      totalTaxLiability: 250,
      availableBalance: 750,
      healthIndex: '4.00',
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.aggregate).toHaveBeenCalledWith({
      where: { companyId: 'company-001' },
      _sum: { amount: true },
    });
    expect(prisma.taxObligation.aggregate).toHaveBeenCalledWith({
      where: { companyId: 'company-001', status: ObligationStatus.PENDING },
      _sum: { amount: true },
    });
  });

  it('restringe matching bancario ao mesmo companyId da obrigacao fiscal', async () => {
    const obligation: TaxObligationRecord = {
      id: 'obligation-001',
      companyId: 'company-001',
      status: ObligationStatus.PENDING,
      dueDate: new Date('2026-09-20T00:00:00.000Z'),
      amount: new Prisma.Decimal(100),
    };

    prisma.taxObligation.findMany.mockResolvedValue([obligation]);
    prisma.bankTransaction.findFirst.mockResolvedValue({ id: 'transaction-001' });
    prisma.taxObligation.update.mockResolvedValue({
      ...obligation,
      status: ObligationStatus.PAID,
    });

    await service.reconcileTaxObligations('company-001', 'user-001');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-001',
          amount: new Prisma.Decimal(-100),
          reconciled: false,
        }),
      }),
    );
  });
});
