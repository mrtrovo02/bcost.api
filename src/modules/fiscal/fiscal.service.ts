'use strict';

import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service.js';
import { UploadXmlDto } from './dto/upload-xml.dto.js';
import {
  Prisma,
  InvoiceType,
  InvoiceStatus,
  Invoice,
  NotificationType,
  NotificationSeverity,
  ComplianceStatus,
  NotificationStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface ComplianceIssue {
  checkName: string;
  severity: NotificationSeverity;
  description: string;
}

type FiscalSyncStatus = {
  revenue: number;
  taxPaid: number;
  taxSaved: number;
  healthScore: number;
  rbt12: number;
  usagePercent: string;
  warning: string;
  lastUpdate: string;
};

type FiscalPerformancePoint = {
  month: string;
  year: number;
  faturamento: number;
  imposto: number;
  impostoSemBcost: number;
  impostoComBcost: number;
  taxSaved: number;
  optimized: boolean;
  isSnapshot: boolean;
};

type SimplesAnnex = 'III' | 'V';

const SIMPLES_TABLES: Record<
  SimplesAnnex,
  Array<{ limit: number; rate: number; deduction: number }>
> = {
  III: [
    { limit: 180_000, rate: 0.06, deduction: 0 },
    { limit: 360_000, rate: 0.112, deduction: 9_360 },
    { limit: 720_000, rate: 0.135, deduction: 17_640 },
    { limit: 1_800_000, rate: 0.16, deduction: 35_640 },
    { limit: 3_600_000, rate: 0.21, deduction: 125_640 },
    { limit: 4_800_000, rate: 0.33, deduction: 648_000 },
  ],
  V: [
    { limit: 180_000, rate: 0.155, deduction: 0 },
    { limit: 360_000, rate: 0.18, deduction: 4_500 },
    { limit: 720_000, rate: 0.195, deduction: 9_900 },
    { limit: 1_800_000, rate: 0.205, deduction: 17_100 },
    { limit: 3_600_000, rate: 0.23, deduction: 62_100 },
    { limit: 4_800_000, rate: 0.305, deduction: 540_000 },
  ],
};

@Injectable()
export class FiscalService implements OnModuleInit {
  private readonly logger = new Logger(FiscalService.name);

  private readonly simplesLimit = 4_800_000;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('xml-extraction') private readonly xmlQueue: Queue,
  ) {}

  // FIX BOOTSTRAP: onModuleInit não pode ter await de rede
  // xmlQueue.client aguardava conexão Redis — bloqueava NestFactory.create()
  onModuleInit(): void {
    // Fire-and-forget — verifica Redis em background após bootstrap
    setTimeout(() => {
      void this.verifyRedisConnectivity();
    }, 500);
  }

  private async verifyRedisConnectivity(): Promise<void> {
    try {
      const client = (await this.xmlQueue.client) as
        | { ping?: () => Promise<unknown> }
        | undefined;
      await client?.ping?.();
      this.logger.log('✅ Conexão Redis para Faturas ativa.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`⚠️ Redis aguardando conexão: ${message}`);
    }
  }

  private toNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number {
    if (value === null || value === undefined) return 0;

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getMonthName(month: number): string {
    const names = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];

    return names[Math.max(0, Math.min(11, month - 1))] ?? String(month);
  }

  private getEffectiveSimplesRate(rbt12: number, annex: SimplesAnnex) {
    const table = SIMPLES_TABLES[annex];
    const bracket = table.find((item) => rbt12 <= item.limit) ?? table.at(-1)!;
    const effectiveRate =
      rbt12 > 0
        ? (rbt12 * bracket.rate - bracket.deduction) / rbt12
        : bracket.rate;

    return {
      effectiveRate: Math.max(effectiveRate, 0),
      bracket,
    };
  }

  private calculateFactorRPercent(payroll12: number, rbt12: number): number {
    if (payroll12 > 0 && rbt12 === 0) return 28;
    if (payroll12 === 0) return 1;
    return (payroll12 / rbt12) * 100;
  }

  private getFiscalWarning(params: {
    rbt12: number;
    usagePercent: number;
    fatorR: number;
    unreconciled: number;
  }): string {
    const { usagePercent, fatorR, unreconciled } = params;

    if (usagePercent >= 90) {
      return 'Atenção: empresa próxima do limite anual do Simples Nacional.';
    }

    if (fatorR > 0 && fatorR < 28) {
      return 'Atenção: Fator R abaixo de 28%. Existe risco de tributação no Anexo V.';
    }

    if (unreconciled > 10) {
      return 'Atenção: alto volume de notas sem conciliação bancária.';
    }

    return 'Operação fiscal saudável.';
  }

  private calculateHealthScore(params: {
    usagePercent: number;
    fatorR: number;
    unreconciled: number;
    openComplianceIssues: number;
  }): number {
    const { usagePercent, fatorR, unreconciled, openComplianceIssues } = params;

    let score = 100;

    if (usagePercent >= 90) score -= 25;
    else if (usagePercent >= 75) score -= 12;

    if (fatorR > 0 && fatorR < 28) score -= 20;

    if (unreconciled > 10) score -= 15;
    else if (unreconciled > 0) score -= 5;

    if (openComplianceIssues > 0) {
      score -= Math.min(25, openComplianceIssues * 5);
    }

    return Math.max(0, Math.min(100, score));
  }

  // ---------------------------------------------------------------------------
  // Fiscal Intelligence — compatibilidade com frontend comercial
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/fiscal/sync-status/:companyId
   *
   * Entrega os KPIs esperados pelo frontend:
   * - revenue
   * - taxPaid
   * - taxSaved
   * - healthScore
   * - rbt12
   * - usagePercent
   * - warning
   * - lastUpdate
   */
  async getFiscalSyncStatus(
    companyId: string,
    month: number,
    year: number,
  ): Promise<FiscalSyncStatus> {
    this.logger.log(
      `[Fiscal Intelligence] Calculando sync-status company=${companyId}, month=${month}, year=${year}`,
    );

    const company = await this.prisma.extended.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        lastSyncAt: true,
        taxRegime: true,
        active: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não cadastrada.');
    }

    const monthlyTax = await this.calculateMonthlyTax(companyId, month, year);

    const now = new Date();
    const rbtStart = new Date(now);
    rbtStart.setMonth(rbtStart.getMonth() - 12);

    const [rbtInvoices, unreconciled, openComplianceIssues] = await Promise.all(
      [
        this.prisma.extended.invoice.findMany({
          where: {
            companyId,
            issuedAt: {
              gte: rbtStart,
              lte: now,
            },
            status: InvoiceStatus.NORMAL,
          },
          select: {
            amount: true,
          },
        }),
        this.prisma.extended.invoice.count({
          where: {
            companyId,
            reconciled: false,
            status: InvoiceStatus.NORMAL,
          },
        }),
        this.prisma.complianceCheck.count({
          where: {
            companyId,
            resolved: false,
          },
        }),
      ],
    );

    const rbt12 = rbtInvoices.reduce(
      (acc, invoice) => acc.plus(invoice.amount),
      new Prisma.Decimal(0),
    );

    const rbt12Number = rbt12.toNumber();
    const usagePercentNumber = Number(
      ((rbt12Number / this.simplesLimit) * 100).toFixed(2),
    );

    const fatorR = monthlyTax.metrics.fatorR;
    const taxSaved = monthlyTax.financial.economiaFatorR;
    const taxPaid = monthlyTax.financial.impostoAPagar;
    const revenue = monthlyTax.metrics.faturamentoMes;

    const healthScore = this.calculateHealthScore({
      usagePercent: usagePercentNumber,
      fatorR,
      unreconciled,
      openComplianceIssues,
    });

    return {
      revenue,
      taxPaid,
      taxSaved,
      healthScore,
      rbt12: rbt12Number,
      usagePercent: String(usagePercentNumber),
      warning: this.getFiscalWarning({
        rbt12: rbt12Number,
        usagePercent: usagePercentNumber,
        fatorR,
        unreconciled,
      }),
      lastUpdate: company.lastSyncAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/fiscal/performance/:companyId
   *
   * Série temporal fiscal usada no frontend:
   * - faturamento
   * - impostoSemBcost
   * - impostoComBcost
   * - economia
   */
  async getFiscalPerformance(
    companyId: string,
    year: number,
  ): Promise<FiscalPerformancePoint[]> {
    this.logger.log(
      `[Fiscal Intelligence] Calculando performance company=${companyId}, year=${year}`,
    );

    const yearly = await this.getYearlyPerformance(companyId, year);

    return yearly.map((item: any): FiscalPerformancePoint => {
      const monthNumber = Number(item.month);
      const faturamento = this.toNumber(item.faturamento);
      const impostoComBcost = this.toNumber(item.imposto);
      const estimatedRbt12 = Math.min(
        this.simplesLimit,
        Math.max(faturamento * 12, faturamento),
      );
      const anexoVRate = this.getEffectiveSimplesRate(
        estimatedRbt12,
        'V',
      ).effectiveRate;
      const impostoSemBcost = Number((faturamento * anexoVRate).toFixed(2));
      const taxSaved = Math.max(0, impostoSemBcost - impostoComBcost);

      return {
        month: this.getMonthName(monthNumber),
        year,
        faturamento,
        imposto: impostoComBcost,
        impostoSemBcost,
        impostoComBcost,
        taxSaved: Number(taxSaved.toFixed(2)),
        optimized: taxSaved > 0,
        isSnapshot: Boolean(item.isSnapshot),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Compliance
  // ---------------------------------------------------------------------------

  async runComplianceAudit(companyId: string) {
    this.logger.log(
      `[Compliance] Iniciando auditoria para Company=${companyId}`,
    );

    const issues: ComplianceIssue[] = [];
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // 1. Notas sem reconciliação
    const unreconciled = await this.prisma.extended.invoice.count({
      where: { companyId, reconciled: false, status: InvoiceStatus.NORMAL },
    });

    if (unreconciled > 10) {
      issues.push({
        checkName: 'PENDENCIA_CONCILIACAO',
        severity: NotificationSeverity.WARNING,
        description: `Existem ${unreconciled} notas sem vínculo bancário. Isso distorce o DRE.`,
      });
    }

    // 2. Fator R crítico
    const stats = await this.calculateMonthlyTax(
      companyId,
      currentMonth,
      currentYear,
    );

    if (stats.metrics.fatorR < 28 && stats.metrics.fatorR > 20) {
      issues.push({
        checkName: 'ALERTA_FATOR_R',
        severity: NotificationSeverity.CRITICAL,
        description: `Fator R em ${stats.metrics.fatorR}%. Falta pouco para o Anexo III. Ajuste o Pro-labore.`,
      });
    }

    // Persiste resultados
    for (const issue of issues) {
      await this.prisma.complianceCheck.create({
        data: {
          companyId,
          checkName: issue.checkName,
          severity: issue.severity,
          description: issue.description,
          status: ComplianceStatus.OPEN,
          resolved: false,
        },
      });

      await this.createFiscalNotification(companyId, issue);
    }

    return { auditDate: now, issuesFound: issues.length };
  }

  // ---------------------------------------------------------------------------
  // Projeções
  // ---------------------------------------------------------------------------

  async getFiscalProjections(companyId: string) {
    const lastSnapshots = await this.prisma.financialSnapshot.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (lastSnapshots.length === 0) {
      return { message: 'Dados insuficientes para projeção.' };
    }

    const avgTax =
      lastSnapshots.reduce((acc, s) => acc + s.taxPayable.toNumber(), 0) /
      lastSnapshots.length;

    return {
      estimatedTaxNextMonth: Number(avgTax.toFixed(2)),
      confidence: lastSnapshots.length >= 3 ? 'HIGH' : 'MEDIUM',
      recommendation:
        avgTax > 5000
          ? 'Considere revisão do regime tributário.'
          : 'Alíquota dentro da média.',
    };
  }

  // ---------------------------------------------------------------------------
  // Notificações internas
  // ---------------------------------------------------------------------------

  private async createFiscalNotification(
    companyId: string,
    issue: ComplianceIssue,
  ): Promise<void> {
    await this.prisma.notificationLog.create({
      data: {
        companyId,
        type: NotificationType.COMPLIANCE_ISSUE,
        title: `Alerta Fiscal: ${issue.checkName}`,
        message: issue.description,
        severity: issue.severity,
        status: NotificationStatus.PENDING,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Snapshot financeiro
  // ---------------------------------------------------------------------------

  async generateFinancialSnapshot(
    companyId: string,
    month: number,
    year: number,
  ) {
    const stats = await this.calculateMonthlyTax(companyId, month, year);
    const rawData = `${companyId}-${year}-${month}-${stats.metrics.faturamentoMes}`;
    const integrityHash = crypto
      .createHash('sha256')
      .update(rawData)
      .digest('hex');

    return this.prisma.financialSnapshot.upsert({
      where: { integrityHash },
      update: {
        revenue: stats.metrics.faturamentoMes,
        taxPayable: stats.financial.impostoAPagar,
        fatorRData: stats.metrics,
        netProfit: new Prisma.Decimal(stats.metrics.faturamentoMes).minus(
          stats.metrics.folhaMes,
        ),
      },
      create: {
        companyId,
        month,
        year,
        revenue: stats.metrics.faturamentoMes,
        expenses: 0,
        taxPayable: stats.financial.impostoAPagar,
        netProfit: new Prisma.Decimal(stats.metrics.faturamentoMes).minus(
          stats.metrics.folhaMes,
        ),
        fatorRData: stats.metrics,
        integrityHash,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Cálculo mensal de imposto
  // ---------------------------------------------------------------------------

  async calculateMonthlyTax(companyId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [invoices, rbtInvoices, payroll12] = await Promise.all([
      this.prisma.extended.invoice.findMany({
        where: {
          companyId,
          issuedAt: { gte: startDate, lte: endDate },
          status: InvoiceStatus.NORMAL,
        },
      }),
      this.prisma.extended.invoice.findMany({
        where: {
          companyId,
          issuedAt: {
            gte: new Date(year - 1, month - 1, 1),
            lt: startDate,
          },
          status: InvoiceStatus.NORMAL,
        },
      }),
      this.prisma.payroll.findMany({
        where: {
          companyId,
          OR: [
            { year, month: { lt: month } },
            { year: year - 1, month: { gte: month } },
          ],
        },
      }),
    ]);

    const faturamentoMes = invoices.reduce(
      (acc, inv) => acc.plus(inv.amount),
      new Prisma.Decimal(0),
    );

    const rbt12 = rbtInvoices.reduce(
      (acc, inv) => acc.plus(inv.amount),
      new Prisma.Decimal(0),
    );

    const folha12 = payroll12.reduce(
      (acc, p) => acc.plus(p.totalAmount),
      new Prisma.Decimal(0),
    );

    const fatorR = this.calculateFactorRPercent(
      folha12.toNumber(),
      rbt12.toNumber(),
    );

    const anexoUtilizado = fatorR >= 28 ? 'III' : 'V';
    const { effectiveRate: aliqEfetiva } = this.getEffectiveSimplesRate(
      rbt12.toNumber(),
      anexoUtilizado,
    );
    const anexoIIIRate = this.getEffectiveSimplesRate(
      rbt12.toNumber(),
      'III',
    ).effectiveRate;
    const anexoVRate = this.getEffectiveSimplesRate(
      rbt12.toNumber(),
      'V',
    ).effectiveRate;
    const impostoAPagar = faturamentoMes.mul(aliqEfetiva);

    const period = `${year}-${String(month).padStart(2, '0')}`;

    return {
      metrics: {
        faturamentoMes: faturamentoMes.toNumber(),
        folhaMes: folha12.toNumber(),
        folha12: folha12.toNumber(),
        rbt12: rbt12.toNumber(),
        fatorR: Number(fatorR.toFixed(2)),
        anexoUtilizado,
        aliqEfetiva: Number((aliqEfetiva * 100).toFixed(4)),
      },
      financial: {
        impostoAPagar: Number(impostoAPagar.toFixed(2)),
        economiaFatorR:
          anexoUtilizado === 'III'
            ? Number(
                faturamentoMes
                  .mul(Math.max(anexoVRate - anexoIIIRate, 0))
                  .toFixed(2),
              )
            : 0,
      },
      integrity: {
        count: invoices.length,
        period,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Upload de XML
  // ---------------------------------------------------------------------------

  async enqueueXmlUpload(
    companyId: string,
    files: Array<{
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    }>,
    details: UploadXmlDto,
  ) {
    const company = await this.prisma.extended.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa não cadastrada.');
    }

    const jobs = files.map((file) => ({
      name: 'xml-extraction-job',
      data: {
        xmlContent: file.buffer.toString('utf-8'),
        companyId,
        type: details.type,
        originalName: file.originalname,
      },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      },
    }));

    const enqueued = await this.xmlQueue.addBulk(jobs);

    return {
      status: 'queued',
      count: enqueued.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Performance anual
  // ---------------------------------------------------------------------------

  async getYearlyPerformance(companyId: string, year: number) {
    const snapshots = await this.prisma.financialSnapshot.findMany({
      where: { companyId, year },
      orderBy: { month: 'asc' },
    });

    if (snapshots.length > 0) {
      return snapshots.map((s) => ({
        month: s.month,
        faturamento: s.revenue.toNumber(),
        imposto: s.taxPayable.toNumber(),
        isSnapshot: true,
      }));
    }

    const invoices = await this.prisma.extended.invoice.findMany({
      where: {
        companyId,
        issuedAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59),
        },
        status: InvoiceStatus.NORMAL,
      },
    });

    const monthlyMap = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      faturamento: new Prisma.Decimal(0),
      imposto: new Prisma.Decimal(0),
    }));

    for (const inv of invoices) {
      const idx = inv.issuedAt.getMonth();

      monthlyMap[idx].faturamento = monthlyMap[idx].faturamento.plus(
        inv.amount,
      );

      const estimatedRbt12 = Math.min(
        this.simplesLimit,
        Math.max(
          monthlyMap[idx].faturamento.toNumber() * 12,
          monthlyMap[idx].faturamento.toNumber(),
        ),
      );
      monthlyMap[idx].imposto = monthlyMap[idx].faturamento.mul(
        this.getEffectiveSimplesRate(estimatedRbt12, 'III').effectiveRate,
      );
    }

    return monthlyMap.map((m) => ({
      month: m.month,
      faturamento: m.faturamento.toNumber(),
      imposto: m.imposto.toNumber(),
      isSnapshot: false,
    }));
  }

  // ---------------------------------------------------------------------------
  // Otimização Fator R
  // ---------------------------------------------------------------------------

  async getFactorROptimization(companyId: string, month: number, year: number) {
    const stats = await this.calculateMonthlyTax(companyId, month, year);
    const { faturamentoMes, folhaMes, fatorR } = stats.metrics;

    if (fatorR >= 28) {
      return {
        optimized: true,
        message: 'Benefício fiscal do Anexo III garantido.',
        currentSaving: stats.financial.economiaFatorR,
      };
    }

    const faturamentoDecimal = new Prisma.Decimal(faturamentoMes);
    const rbt12 = new Prisma.Decimal(stats.metrics.rbt12 || faturamentoMes);
    const folha12 = new Prisma.Decimal(stats.metrics.folha12 || folhaMes);
    const folhaIdeal = rbt12.mul(0.28).toNumber();
    const anexoVRate = this.getEffectiveSimplesRate(
      rbt12.toNumber(),
      'V',
    ).effectiveRate;
    const anexoIIIRate = this.getEffectiveSimplesRate(
      rbt12.toNumber(),
      'III',
    ).effectiveRate;

    return {
      optimized: false,
      message: 'Alerta: Empresa enquadrada no Anexo V (Alíquota cara).',
      action: `Ajuste a folha dos 12 meses anteriores em R$ ${Math.max(
        folhaIdeal - folha12.toNumber(),
        0,
      ).toFixed(2)} para migrar ao Anexo III.`,
      potentialSaving: Number(
        faturamentoDecimal
          .mul(Math.max(anexoVRate - anexoIIIRate, 0))
          .toFixed(2),
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Listagem de faturas
  // ---------------------------------------------------------------------------

  async getCompanyInvoices(companyId: string) {
    return this.prisma.extended.invoice.findMany({
      where: { companyId },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    });
  }

  // ---------------------------------------------------------------------------
  // Seed de demonstração
  // ---------------------------------------------------------------------------

  async seedDemoData(companyId: string) {
    const year = new Date().getFullYear();
    const results: Invoice[] = [];

    const customer = await this.prisma.customer.upsert({
      where: {
        companyId_document: {
          companyId,
          document: '00.000.000/0001-91',
        },
      },
      update: {},
      create: {
        companyId,
        name: 'Cliente Padrão bCost',
        document: '00.000.000/0001-91',
        email: 'cliente@bcost.com.br',
      },
    });

    for (let m = 1; m <= 12; m++) {
      const issuedAt = new Date(year, m - 1, 15);
      const existing = await this.prisma.invoice.findFirst({
        where: {
          companyId,
          customerId: customer.id,
          issuedAt,
        },
      });

      if (!existing) {
        const res = await this.prisma.invoice.create({
          data: {
            companyId,
            customerId: customer.id,
            amount: new Prisma.Decimal(10_000.0),
            taxAmount: new Prisma.Decimal(600.0),
            accessKey: `352602${year}${String(m).padStart(2, '0')}${Math.random()
              .toString()
              .substring(2, 8)}`,
            issuedAt,
            type: InvoiceType.SERVICE,
            status: InvoiceStatus.NORMAL,
            reconciled: false,
          },
        });

        results.push(res);
      } else {
        results.push(existing);
      }
    }

    return {
      status: 'success',
      created: results.length,
    };
  }
}
