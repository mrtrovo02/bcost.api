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
  ComplianceStatus,
  JobStatus,
  NotificationSeverity,
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
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(250000) },
        }),
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
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tax-1',
            name: 'DAS',
            amount: new Prisma.Decimal(5000),
            dueDate: new Date(),
            status: ObligationStatus.PAID,
          },
        ]),
      },
      taxCalculation: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: new Prisma.Decimal(1234.56) },
        }),
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
        count: jest.fn().mockResolvedValue(2),
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
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'check-1',
            severity: NotificationSeverity.CRITICAL,
            checkName: 'XML pendente',
            description: 'Documento sem validação.',
            createdAt: new Date(),
          },
        ]),
      },
      financialSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            action: 'INVOICE_IMPORTED',
            module: 'FISCAL',
            createdAt: new Date(),
          },
        ]),
      },
      payroll: {
        count: jest.fn().mockResolvedValue(1),
      },
      digitalCertificate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cert-1',
            issuer: 'ICP-Brasil',
            validTo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          },
        ]),
      },
      withRlsCompanyContext: jest
        .fn()
        .mockImplementation(async (_companyId, callback) =>
          callback(prismaMock),
        ),
    };

    const analyticsServiceMock = {
      getFiscalHealthScore: jest.fn().mockResolvedValue(92),
      getRevenueHistory: jest
        .fn()
        .mockResolvedValue([{ month: 1, value: 100 }]),
    };
    const insightsServiceMock = {
      getFinancialHealth: jest.fn().mockResolvedValue({
        score: 88,
        status: 'HEALTHY',
      }),
    };
    const cashFlowServiceMock = {
      getLatestProjection: jest
        .fn()
        .mockResolvedValue([{ day: 1, cash: 1000 }]),
    };
    const anomalyServiceMock = {
      detectAnomalies: jest
        .fn()
        .mockResolvedValue([{ deviationScore: 2.5 }, { deviationScore: 1.1 }]),
    };

    return {
      service: new DashboardService(
        prismaMock as never,
        analyticsServiceMock as never,
        insightsServiceMock as never,
        cashFlowServiceMock as never,
        anomalyServiceMock as never,
      ),
      prismaMock,
      analyticsServiceMock,
      insightsServiceMock,
      cashFlowServiceMock,
      anomalyServiceMock,
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

  it('consolida visão geral com agregados diretos dentro do contexto RLS', async () => {
    const { service, prismaMock } = createService();
    prismaMock.invoice.count.mockResolvedValueOnce(4);

    const result = await service.getCompanyOverview('company-1');

    expect(result.summary).toMatchObject({
      fiscalScore: 92,
      financialScore: 88,
      totalRevenueYTD: 250000,
      activeAutomations: 2,
      criticalAnomalies: 1,
      overdueObligations: 3,
      unreconciledInvoices: 4,
    });
    expect(prismaMock.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prismaMock.automationJob.count).toHaveBeenCalledWith({
      where: { companyId: 'company-1', status: JobStatus.RUNNING },
    });
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { action: true, createdAt: true, module: true },
    });
  });

  it('consolida o cockpit gerencial dentro do contexto RLS da empresa', async () => {
    const { service, prismaMock } = createService();

    await service.getManagementCockpit('company-1');

    expect(prismaMock.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId: 'company-1' }),
      select: expect.objectContaining({
        id: true,
        amount: true,
        taxAmount: true,
      }),
    });
  });

  it('deve lançar InternalServerErrorException quando a empresa não existir', async () => {
    const { service } = createService(null);

    await expect(
      service.getManagementCockpit('company-inexistente'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('calcula métricas em tempo real dentro do contexto RLS da empresa', async () => {
    const { service, prismaMock } = createService();
    prismaMock.invoice.count.mockResolvedValueOnce(8).mockResolvedValueOnce(6);
    prismaMock.payroll.count.mockResolvedValueOnce(2);

    const result = await service.getRealTimeMetrics('company-1');

    expect(result).toMatchObject({
      processedInvoices: 8,
      reconciledInvoices: 6,
      reconciliationRate: 75,
      estimatedTaxProvision: 1234.56,
      payrollRegistered: true,
      engineStatus: 'STABLE',
    });
    expect(prismaMock.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prismaMock.taxCalculation.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId: 'company-1' }),
      _sum: { totalAmount: true },
    });
  });

  it('lista alertas financeiros dentro do contexto RLS da empresa', async () => {
    const { service, prismaMock } = createService();
    prismaMock.taxObligation.findMany
      .mockResolvedValueOnce([
        {
          id: 'tax-upcoming',
          name: 'DAS',
          amount: new Prisma.Decimal(1000),
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          status: ObligationStatus.PENDING,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'tax-overdue',
          name: 'INSS',
          amount: new Prisma.Decimal(500),
          dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          status: ObligationStatus.OVERDUE,
        },
      ]);

    const result = await service.getFinancialAlerts('company-1', 7);

    expect(result.upcoming).toHaveLength(1);
    expect(result.overdue).toHaveLength(1);
    expect(result.certificates).toHaveLength(1);
    expect(prismaMock.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prismaMock.digitalCertificate.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        validTo: { lte: expect.any(Date) },
        status: 'ACTIVE',
      },
      select: { id: true, issuer: true, validTo: true },
    });
  });

  it('calcula diagnóstico de compliance dentro do contexto RLS da empresa', async () => {
    const { service, prismaMock } = createService();
    prismaMock.complianceCheck.findMany
      .mockResolvedValueOnce([
        {
          id: 'critical-issue',
          severity: NotificationSeverity.CRITICAL,
          checkName: 'XML sem validação',
          description: 'Documento fiscal precisa de revisão.',
          createdAt: new Date('2026-01-10T00:00:00.000Z'),
        },
        {
          id: 'warning-issue',
          severity: NotificationSeverity.WARNING,
          checkName: 'Certificado próximo do vencimento',
          description: 'Certificado digital vence no mês.',
          createdAt: new Date('2026-01-11T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'in-progress-issue',
          severity: NotificationSeverity.INFO,
          checkName: 'Conferência em andamento',
          description: 'Item já está com operação interna.',
          createdAt: new Date('2026-01-12T00:00:00.000Z'),
        },
      ]);
    prismaMock.complianceCheck.count.mockResolvedValueOnce(3);

    const result = await service.getComplianceDiagnostic('company-1');

    expect(result).toMatchObject({
      complianceScore: 75,
      status: 'WARNING',
      issuesFound: 2,
      inProgress: 1,
      resolvedThisMonth: 3,
      criticalBlockers: 1,
    });
    expect(prismaMock.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prismaMock.complianceCheck.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        status: ComplianceStatus.OPEN,
        resolved: false,
      },
      orderBy: { severity: 'desc' },
    });
  });
});
