import { InternalServerErrorException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

// Mock do @prisma/client provendo fallbacks seguros para Enums e Decimal no Jest
jest.mock('@prisma/client', () => {
  let actual: any = {};
  try {
    actual = jest.requireActual('@prisma/client');
  } catch {}

  return {
    ...actual,
    AccountType: actual.AccountType || {
      DESPESA: 'DESPESA',
      RECEITA: 'RECEITA',
      ATIVO: 'ATIVO',
      PASSIVO: 'PASSIVO',
      PATRIMONIO_LIQUIDO: 'PATRIMONIO_LIQUIDO',
    },
    JobStatus: actual.JobStatus || {
      RUNNING: 'RUNNING',
      FAILED: 'FAILED',
      COMPLETED: 'COMPLETED',
      PENDING: 'PENDING',
    },
    ObligationStatus: actual.ObligationStatus || {
      PAID: 'PAID',
      PENDING: 'PENDING',
      OVERDUE: 'OVERDUE',
    },
    Prisma: actual.Prisma || {
      Decimal: class Decimal {
        private val: number;
        constructor(v: number | string) {
          this.val = Number(v);
        }
        toNumber() {
          return this.val;
        }
        toString() {
          return String(this.val);
        }
      },
    },
  };
});

import {
  AccountType,
  JobStatus,
  ObligationStatus,
  Prisma,
} from '@prisma/client';

describe('DashboardService (Management Cockpit)', () => {
  const createService = (customCompanyMock?: any) => {
    const prismaMock = {
      company: {
        findUnique: jest.fn().mockResolvedValue(
          customCompanyMock !== undefined
            ? customCompanyMock
            : {
                id: 'company-1',
                name: 'Empresa Teste',
                settings: {
                  budget: {
                    monthlyRevenue: 100000,
                    monthlyExpenses: 40000,
                    monthlyNetCash: 30000,
                    costCenters: [{ name: 'Operações', planned: 20000 }],
                  },
                },
              },
        ),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            amount: new Prisma.Decimal(100000),
            taxAmount: new Prisma.Decimal(7000),
            issuedAt: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              5,
            ),
            reconciled: true,
            status: 'NORMAL',
          },
          {
            id: 'inv-2',
            amount: new Prisma.Decimal(50000),
            taxAmount: new Prisma.Decimal(3500),
            issuedAt: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              12,
            ),
            reconciled: false,
            status: 'NORMAL',
          },
        ]),
      },
      taxObligation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tax-1',
            amount: new Prisma.Decimal(5000),
            dueDate: new Date(),
            status: ObligationStatus.PAID,
          },
        ]),
      },
      fiscalObligation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'fis-1',
            status: 'PENDING',
            dueDate: new Date(),
            type: 'DAS',
          },
        ]),
      },
      bankTransaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bank-1',
            amount: new Prisma.Decimal(120000),
            type: 'CREDIT',
            occurredAt: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              10,
            ),
            reconciled: true,
            description: 'Recebimento',
          },
          {
            id: 'bank-2',
            amount: new Prisma.Decimal(45000),
            type: 'DEBIT',
            occurredAt: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              11,
            ),
            reconciled: false,
            description: 'Fornecedor',
          },
        ]),
      },
      accountingEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'entry-1',
            amount: new Prisma.Decimal(30000),
            month: new Date().getMonth() + 1,
            debitCode: '5.1.01',
            creditCode: '1.1.01',
            description: 'Operações',
          },
        ]),
      },
      accountPlan: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { code: '5.1.01', name: 'Operações', type: AccountType.DESPESA },
          ]),
      },
      automationJob: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'job-1',
            status: JobStatus.RUNNING,
            name: 'Conciliação',
            updatedAt: new Date(),
          },
          {
            id: 'job-2',
            status: JobStatus.FAILED,
            name: 'Importação',
            updatedAt: new Date(),
          },
        ]),
      },
      complianceCheck: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'check-1',
            severity: 'CRITICAL',
            checkName: 'XML pendente',
            description: 'Documento sem validação.',
          },
        ]),
      },
      financialSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const noop = {} as never;
    return {
      service: new DashboardService(
        prismaMock as never,
        noop,
        noop,
        noop,
        noop,
      ),
      prismaMock,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consolida DRE, caixa, orçamento, centro de custos e conciliação', async () => {
    const { service } = createService();

    const result = await service.getManagementCockpit('company-1');

    expect(result.company).toMatchObject({
      id: 'company-1',
      name: 'Empresa Teste',
    });
    expect(result.kpis).toMatchObject({
      revenueYtd: 150000,
      expensesYtd: 30000,
      cashInYtd: 120000,
      cashOutYtd: 45000,
      netCashYtd: 75000,
      openFiscalObligations: 1,
      criticalIssues: 1,
    });
    expect(result.dre.netIncome).toBe(114500);
    expect(result.reconciliation.invoices).toMatchObject({
      total: 2,
      reconciled: 1,
      pending: 1,
    });
    expect(result.costCenters[0]).toMatchObject({
      name: 'Operações',
      actual: 30000,
      planned: 20000,
      variance: 10000,
    });
    expect(result.budgetVsActual.revenue).toMatchObject({
      planned: 100000,
      actual: 150000,
      variance: 50000,
    });
  });

  it('deve lançar InternalServerErrorException quando a empresa não existir', async () => {
    const { service } = createService(null);

    await expect(
      service.getManagementCockpit('company-inexistente'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
