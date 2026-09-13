import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { BankingService } from './banking.service.js';

interface BankingPrismaMock {
  bankTransaction: {
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    findMany: jest.Mock<Promise<unknown[]>, [unknown]>;
    aggregate: jest.Mock<
      Promise<{ _sum: { amount: Prisma.Decimal | null }; _count: number }>,
      [unknown]
    >;
    update: jest.Mock<Promise<unknown>, [unknown]>;
  };
  bankAccount: {
    findMany: jest.Mock<Promise<unknown[]>, [unknown]>;
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    aggregate: jest.Mock<
      Promise<{ _sum: { balanceCache: Prisma.Decimal | null } }>,
      [unknown]
    >;
  };
  invoice: {
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    update: jest.Mock<Promise<unknown>, [unknown]>;
  };
  taxObligation: {
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    update: jest.Mock<Promise<unknown>, [unknown]>;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: BankingPrismaMock) => Promise<unknown>]
  >;
}

function createPrismaMock(): BankingPrismaMock {
  const prisma = {
    bankTransaction: {
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'transaction-001',
        reconciled: false,
        invoiceId: 'invoice-001',
        taxObligationId: 'obligation-001',
      }),
      findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
      aggregate: jest
        .fn<
          Promise<{ _sum: { amount: Prisma.Decimal | null }; _count: number }>,
          [unknown]
        >()
        .mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(0) },
          _count: 0,
        }),
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'transaction-001',
      }),
    },
    bankAccount: {
      findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'account-001',
        bankName: 'Banco Teste',
        agency: '0001',
        account: '12345-6',
        balanceCache: new Prisma.Decimal(100),
      }),
      aggregate: jest
        .fn<
          Promise<{ _sum: { balanceCache: Prisma.Decimal | null } }>,
          [unknown]
        >()
        .mockResolvedValue({
          _sum: { balanceCache: new Prisma.Decimal(100) },
        }),
    },
    invoice: {
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'invoice-001',
        reconciled: false,
      }),
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'invoice-001',
      }),
    },
    taxObligation: {
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'obligation-001',
      }),
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'obligation-001',
      }),
    },
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: BankingPrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

describe('BankingService tenant isolation', () => {
  let prisma: BankingPrismaMock;
  let service: BankingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BankingService(prisma as unknown as PrismaService);
  });

  it('vincula nota fiscal usando contexto RLS e filtros por empresa', async () => {
    await service.linkInvoice('company-001', 'transaction-001', 'invoice-001');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'transaction-001', companyId: 'company-001' },
    });
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'invoice-001', companyId: 'company-001' },
    });
  });

  it('vincula obrigacao fiscal usando contexto RLS e filtros por empresa', async () => {
    await service.linkTaxObligation(
      'company-001',
      'transaction-001',
      'obligation-001',
    );

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'transaction-001', companyId: 'company-001' },
    });
    expect(prisma.taxObligation.findFirst).toHaveBeenCalledWith({
      where: { id: 'obligation-001', companyId: 'company-001' },
    });
  });

  it('desfaz conciliacao usando contexto RLS e filtro por empresa', async () => {
    prisma.bankTransaction.findFirst.mockResolvedValueOnce({
      id: 'transaction-001',
      reconciled: true,
      invoiceId: 'invoice-001',
      taxObligationId: 'obligation-001',
    });

    await service.unlinkTransaction('company-001', 'transaction-001');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'transaction-001', companyId: 'company-001' },
      select: {
        id: true,
        reconciled: true,
        invoiceId: true,
        taxObligationId: true,
      },
    });
  });

  it('lista transacoes bancarias dentro do contexto RLS da empresa', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T23:59:59.999Z');

    await service.listTransactionsForCompany({
      companyId: 'company-001',
      from,
      to,
      limit: 25,
    });

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-001',
        occurredAt: { gte: from, lte: to },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 25,
    });
  });

  it('lista contas bancarias dentro do contexto RLS da empresa', async () => {
    await service.listAccountsForCompany('company-001');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankAccount.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-001' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('calcula resumo financeiro dentro do contexto RLS da empresa', async () => {
    prisma.bankTransaction.aggregate
      .mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal(1500) },
        _count: 2,
      })
      .mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal(400) },
        _count: 1,
      });

    const result = await service.getFinancialSummary('company-001');

    expect(result).toEqual({
      totalCredit: 1500,
      totalDebit: 400,
      ledgerBalance: 1100,
      cachedBalance: 100,
      transactions: {
        credits: 2,
        debits: 1,
        total: 3,
      },
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        companyId: 'company-001',
        type: TransactionType.CREDIT,
      },
      _sum: { amount: true },
      _count: true,
    });
  });

  it('calcula saldo de conta dentro do contexto RLS da empresa', async () => {
    prisma.bankTransaction.aggregate
      .mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal(1000) },
        _count: 1,
      })
      .mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal(300) },
        _count: 1,
      });

    const result = await service.getAccountBalance(
      'company-001',
      'account-001',
    );

    expect(result).toEqual({
      bankAccountId: 'account-001',
      bankName: 'Banco Teste',
      agency: '0001',
      account: '12345-6',
      ledgerBalance: 700,
      cachedBalance: 100,
      drift: 600,
    });
    expect(prisma.bankAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-001', companyId: 'company-001' },
    });
  });
});
