import { PrismaService } from '../../database/prisma.service.js';
import { BankingService } from './banking.service.js';

interface BankingPrismaMock {
  bankTransaction: {
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    findMany: jest.Mock<Promise<unknown[]>, [unknown]>;
    update: jest.Mock<Promise<unknown>, [unknown]>;
  };
  bankAccount: {
    findMany: jest.Mock<Promise<unknown[]>, [unknown]>;
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
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'transaction-001',
      }),
    },
    bankAccount: {
      findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
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
});
