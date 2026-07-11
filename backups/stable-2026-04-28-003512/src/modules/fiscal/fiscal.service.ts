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
  ComplianceStatus, // FIX: importado enum correto
  NotificationStatus, // FIX: importado enum para status de notificação
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

@Injectable()
export class FiscalService implements OnModuleInit {
  private readonly logger = new Logger(FiscalService.name);

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
      const client = await this.xmlQueue.client;
      await client.ping();
      this.logger.log('✅ Conexão Redis para Faturas ativa.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`⚠️ Redis aguardando conexão: ${message}`);
    }
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
          status: ComplianceStatus.OPEN, // FIX: era 'OPEN' string literal
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
        status: NotificationStatus.PENDING, // FIX: era 'PENDING' string literal
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
  // FIX: referenceMonth string → month + year como Int (alinhado ao schema)
  // ---------------------------------------------------------------------------

  async calculateMonthlyTax(companyId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [invoices, payrolls] = await Promise.all([
      this.prisma.extended.invoice.findMany({
        where: {
          companyId,
          issuedAt: { gte: startDate, lte: endDate },
          status: InvoiceStatus.NORMAL,
        },
      }),
      // FIX: era { referenceMonth: referenceMonthStr } — campo não existe mais
      this.prisma.payroll.findMany({
        where: { companyId, month, year },
      }),
    ]);

    const faturamentoMes = invoices.reduce(
      (acc, inv) => acc.plus(inv.amount),
      new Prisma.Decimal(0),
    );
    const folhaMes = payrolls.reduce(
      (acc, p) => acc.plus(p.totalAmount),
      new Prisma.Decimal(0),
    );

    let fatorR = 0;
    if (!faturamentoMes.isZero()) {
      fatorR = folhaMes.div(faturamentoMes).mul(100).toNumber();
    }

    const anexoUtilizado = fatorR >= 28 ? 'III' : 'V';
    const aliqEfetiva = anexoUtilizado === 'III' ? 0.06 : 0.155;
    const impostoAPagar = faturamentoMes.mul(aliqEfetiva);

    // FIX: period agora é string formatada para exibição — não mais usada como chave de query
    const period = `${year}-${String(month).padStart(2, '0')}`;

    return {
      metrics: {
        faturamentoMes: faturamentoMes.toNumber(),
        folhaMes: folhaMes.toNumber(),
        fatorR: Number(fatorR.toFixed(2)),
        anexoUtilizado,
        aliqEfetiva: aliqEfetiva * 100,
      },
      financial: {
        impostoAPagar: impostoAPagar.toNumber(),
        economiaFatorR:
          anexoUtilizado === 'III'
            ? faturamentoMes.mul(0.155).minus(impostoAPagar).toNumber()
            : 0,
      },
      integrity: { count: invoices.length, period },
    };
  }

  // ---------------------------------------------------------------------------
  // Upload de XML
  // ---------------------------------------------------------------------------

  async enqueueXmlUpload(
    companyId: string,
    files: Array<Express.Multer.File>,
    details: UploadXmlDto,
  ) {
    const company = await this.prisma.extended.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa não cadastrada.');

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
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    }));

    const enqueued = await this.xmlQueue.addBulk(jobs);
    return { status: 'queued', count: enqueued.length };
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
      monthlyMap[idx].imposto = monthlyMap[idx].faturamento.mul(0.06);
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
    const folhaIdeal = faturamentoDecimal.mul(0.28).toNumber();

    return {
      optimized: false,
      message: 'Alerta: Empresa enquadrada no Anexo V (Alíquota cara).',
      action: `Ajuste o Pró-labore para R$ ${(folhaIdeal - folhaMes).toFixed(2)} para migrar ao Anexo III.`,
      potentialSaving: faturamentoDecimal.mul(0.095).toNumber(),
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
        companyId_document: { companyId, document: '00.000.000/0001-91' },
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
        where: { companyId, customerId: customer.id, issuedAt },
      });

      if (!existing) {
        const res = await this.prisma.invoice.create({
          data: {
            companyId,
            customerId: customer.id,
            amount: new Prisma.Decimal(10_000.0),
            taxAmount: new Prisma.Decimal(600.0),
            // FIX: accessKey única por mês para evitar colisão no @unique do schema
            accessKey: `352602${year}${String(m).padStart(2, '0')}${Math.random().toString().substring(2, 8)}`,
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

    return { status: 'success', created: results.length };
  }
}
