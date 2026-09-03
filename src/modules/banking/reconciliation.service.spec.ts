import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  ReconciliationService,
  ReconcileTransactionInput,
} from './reconciliation.service.js';

interface ReconciliationPrismaMock {
  bankTransaction: {
    count: jest.Mock<Promise<number>, [unknown]>;
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    update: jest.Mock<Promise<unknown>, [unknown]>;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: ReconciliationPrismaMock) => Promise<unknown>]
  >;
}

function createPrismaMock(): ReconciliationPrismaMock {
  const prisma = {
    bankTransaction: {
      count: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(3),
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'transaction-001',
      }),
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'transaction-001',
      }),
    },
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: ReconciliationPrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

describe('Banking ReconciliationService tenant isolation', () => {
  let prisma: ReconciliationPrismaMock;
  let service: ReconciliationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ReconciliationService(prisma as unknown as PrismaService);
  });

  it('reconcilia transacao dentro do contexto RLS da empresa', async () => {
    const input: ReconcileTransactionInput = { id: 'transaction-001' };

    await service.reconcileTransaction('company-001', input, 'user-001');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'transaction-001', companyId: 'company-001' },
    });
    expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: 'transaction-001' },
      data: { reconciled: true },
    });
  });

  it('conta pendencias de auto-match dentro do contexto RLS da empresa', async () => {
    const result = await service.runAutoMatch('company-001');

    expect(result.processed).toBe(3);
    expect(result.pending).toBe(3);
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.count).toHaveBeenCalledWith({
      where: { companyId: 'company-001', reconciled: false },
    });
  });

  it('desfaz conciliacao limpando vinculos dentro do contexto RLS', async () => {
    const result = await service.undoMatch(
      'transaction-001',
      'user-001',
      'company-001',
    );

    expect(result).toEqual({
      transactionId: 'transaction-001',
      undone: true,
      userId: 'user-001',
    });
    expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: 'transaction-001' },
      data: { reconciled: false, invoiceId: null, taxObligationId: null },
    });
  });

  it('bloqueia undo quando a transacao nao pertence a empresa', async () => {
    prisma.bankTransaction.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.undoMatch('transaction-001', 'user-001', 'company-001'),
    ).rejects.toThrow(NotFoundException);
  });
});
