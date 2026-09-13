import { NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { TaxService } from './tax.service.js';

interface FiscalTaxPrismaMock {
  company: {
    findUnique: jest.Mock<Promise<unknown>, [unknown]>;
  };
  invoice: {
    aggregate: jest.Mock<Promise<unknown>, [unknown]>;
  };
  payroll: {
    aggregate: jest.Mock<Promise<unknown>, [unknown]>;
  };
  bankTransaction: {
    aggregate: jest.Mock<Promise<unknown>, [unknown]>;
  };
  financialSnapshot: {
    count: jest.Mock<Promise<number>, [unknown]>;
    findMany: jest.Mock<Promise<unknown[]>, [unknown]>;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: FiscalTaxPrismaMock) => Promise<unknown>]
  >;
}

function createPrismaMock(): FiscalTaxPrismaMock {
  const prisma = {
    company: {
      findUnique: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'company-001',
      }),
    },
    invoice: {
      aggregate: jest.fn<Promise<unknown>, [unknown]>(),
    },
    payroll: {
      aggregate: jest.fn<Promise<unknown>, [unknown]>(),
    },
    bankTransaction: {
      aggregate: jest.fn<Promise<unknown>, [unknown]>(),
    },
    financialSnapshot: {
      count: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(12),
      findMany: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
    },
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: FiscalTaxPrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

describe('TaxService tenant isolation', () => {
  let prisma: FiscalTaxPrismaMock;
  let service: TaxService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TaxService(prisma as unknown as PrismaService);
  });

  it('calcula imposto mensal usando consultas fiscais dentro do contexto RLS', async () => {
    prisma.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(10000) } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(120000) } });
    prisma.payroll.aggregate.mockResolvedValueOnce({
      _sum: { totalAmount: new Prisma.Decimal(36000) },
    });
    prisma.bankTransaction.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(10500) },
    });

    const result = await service.calculateMonthlyTax('company-001', 8, 2026);

    expect(result.metrics).toMatchObject({
      faturamentoMes: 10000,
      rbt12: 120000,
      fatorR: 30,
      aliqEfetiva: 6,
      anexoUtilizado: 'Anexo III',
    });
    expect(result.financial).toMatchObject({
      impostoAPagar: 600,
      taxPayable: 600,
      gapFolhaMensal: 0,
      economiaFatorR: 0,
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.bankTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        companyId: 'company-001',
        occurredAt: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
        type: TransactionType.CREDIT,
      },
      _sum: { amount: true },
    });
  });

  it('bloqueia calculo mensal quando a empresa nao existe no escopo', async () => {
    prisma.company.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.calculateMonthlyTax('company-001', 8, 2026),
    ).rejects.toThrow(NotFoundException);
  });

  it('simula cenário tributário dentro do contexto RLS', async () => {
    prisma.invoice.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(120000) },
    });

    const result = await service.simulateTaxScenario('company-001', 5000);

    expect(result).toMatchObject({
      projectedRevenue: 5000,
      estimatedTax: 300,
      effectiveRate: 6,
      taxBracket: 1,
    });
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where: { companyId: 'company-001', status: InvoiceStatus.NORMAL },
      _sum: { amount: true },
    });
  });

  it('valida integridade historica dentro do contexto RLS', async () => {
    prisma.financialSnapshot.count.mockResolvedValueOnce(8);

    const result = await service.validateHistoryIntegrity('company-001');

    expect(result).toEqual({
      isNewCompany: true,
      monthsFound: 8,
      isComplete: false,
      status: 'INCOMPLETE_DATA',
    });
    expect(prisma.financialSnapshot.count).toHaveBeenCalledWith({
      where: { companyId: 'company-001' },
    });
  });
});
