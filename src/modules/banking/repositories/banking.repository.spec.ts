import { BadRequestException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { BankingRepository } from './banking.repository.js';

interface BankingRepositoryPrismaMock {
  bankTransaction: {
    create: jest.Mock<Promise<unknown>, [unknown]>;
  };
  bankAccount: {
    update: jest.Mock<Promise<unknown>, [unknown]>;
    aggregate: jest.Mock<
      Promise<{ _sum: { balanceCache: Prisma.Decimal | null } }>,
      [unknown]
    >;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: BankingRepositoryPrismaMock) => Promise<unknown>]
  >;
}

function createPrismaMock(): BankingRepositoryPrismaMock {
  const prisma = {
    bankTransaction: {
      create: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'transaction-001',
      }),
    },
    bankAccount: {
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'account-001',
      }),
      aggregate: jest
        .fn<
          Promise<{ _sum: { balanceCache: Prisma.Decimal | null } }>,
          [unknown]
        >()
        .mockResolvedValue({
          _sum: { balanceCache: new Prisma.Decimal(1500) },
        }),
    },
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: BankingRepositoryPrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

describe('BankingRepository tenant isolation', () => {
  let prisma: BankingRepositoryPrismaMock;
  let repository: BankingRepository;

  beforeEach(() => {
    prisma = createPrismaMock();
    repository = new BankingRepository(prisma as unknown as PrismaService);
  });

  it('cria transacao e atualiza saldo dentro do contexto RLS', async () => {
    await repository.createTransactionWithBalanceUpdate({
      id: 'transaction-001',
      companyId: 'company-001',
      bankAccountId: 'account-001',
      amount: new Prisma.Decimal(250),
      description: 'Recebimento',
      occurredAt: new Date('2026-08-10T00:00:00.000Z'),
      type: TransactionType.CREDIT,
    });

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-001',
        bankAccountId: 'account-001',
        type: TransactionType.CREDIT,
      }),
    });
    expect(prisma.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 'account-001' },
      data: {
        balanceCache: {
          increment: new Prisma.Decimal(250),
        },
      },
    });
  });

  it('bloqueia criacao de transacao sem companyId', async () => {
    await expect(
      repository.createTransactionWithBalanceUpdate({
        id: 'transaction-001',
        companyId: '',
        bankAccountId: 'account-001',
        amount: 250,
        description: 'Recebimento',
        occurredAt: new Date('2026-08-10T00:00:00.000Z'),
        type: TransactionType.CREDIT,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
  });

  it('busca saldo total dentro do contexto RLS', async () => {
    const result = await repository.getTotalBalance('company-001');

    expect(result.toNumber()).toBe(1500);
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankAccount.aggregate).toHaveBeenCalledWith({
      where: { companyId: 'company-001' },
      _sum: {
        balanceCache: true,
      },
    });
  });
});
