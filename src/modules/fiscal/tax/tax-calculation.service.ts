'use strict';

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  TaxRegime,
  Prisma,
  InvoiceStatus,
  ObligationStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export interface TaxCalculationResult {
  period: string;
  companyName: string;
  revenue: number;
  rbt12: number;
  payroll: number;
  factorR: number;
  appliedAnexo: number;
  effectiveRate: number;
  taxAmount: number;
  updatedAt: Date;
}

export type MonthlyTaxPreviewGateStatus = 'PASS' | 'WARN' | 'FAIL';

export type MonthlyTaxPreviewStatus = 'READY_TO_CLOSE' | 'REQUIRES_ACTION' | 'BLOCKED';

export interface MonthlyTaxPreviewOptions {
  hasDigitalCertificate?: boolean;
  hasCrcReview?: boolean;
  hasOfficialPortalAccess?: boolean;
  hasRevenueReconciliation?: boolean;
}

export interface MonthlyTaxClosurePreview {
  status: MonthlyTaxPreviewStatus;
  canClose: boolean;
  calculation: TaxCalculationResult;
  gates: {
    code: string;
    label: string;
    status: MonthlyTaxPreviewGateStatus;
    message: string;
  }[];
  evidenceRequired: string[];
  nextActions: string[];
  generatedAt: string;
}

const SIMPLES_TABLES = {
  3: [
    { limit: 180_000, rate: 0.06, deduction: 0 },
    { limit: 360_000, rate: 0.112, deduction: 9_360 },
    { limit: 720_000, rate: 0.135, deduction: 17_640 },
    { limit: 1_800_000, rate: 0.16, deduction: 35_640 },
    { limit: 3_600_000, rate: 0.21, deduction: 125_640 },
    { limit: 4_800_000, rate: 0.33, deduction: 648_000 },
  ],
  5: [
    { limit: 180_000, rate: 0.155, deduction: 0 },
    { limit: 360_000, rate: 0.18, deduction: 4_500 },
    { limit: 720_000, rate: 0.195, deduction: 9_900 },
    { limit: 1_800_000, rate: 0.205, deduction: 17_100 },
    { limit: 3_600_000, rate: 0.23, deduction: 62_100 },
    { limit: 4_800_000, rate: 0.305, deduction: 540_000 },
  ],
} as const;

function calculateOfficialFactorR(
  payroll12: Prisma.Decimal,
  rbt12: Prisma.Decimal,
): Prisma.Decimal {
  if (payroll12.gt(0) && rbt12.isZero()) return new Prisma.Decimal(0.28);
  if (payroll12.isZero()) return new Prisma.Decimal(0.01);
  return payroll12.div(rbt12);
}

@Injectable()
export class TaxCalculationService {
  private readonly logger = new Logger('bCost-Tax-Engine');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * CÁLCULO CORE: Apuração do Simples Nacional com inteligência de Fator R.
   */
  async calculateSimplesNacional(
    companyId: string,
    month: number,
    year: number,
    userId: string,
  ): Promise<TaxCalculationResult> {
    const startTime = Date.now();
    this.logger.log(
      `[Tax-Engine] Iniciando apuração: Empresa ${companyId} - ${month}/${year}`,
    );

    // 1. Validação temporal
    const now = new Date();
    if (
      year > now.getFullYear() ||
      (year === now.getFullYear() && month > now.getMonth() + 1)
    ) {
      throw new BadRequestException(
        'A competência selecionada ainda não foi encerrada.',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { taxRegime: true, anexo: true, name: true },
    });

    if (!company)
      throw new NotFoundException('Empresa não encontrada no sistema.');
    if (company.taxRegime !== TaxRegime.SIMPLES_NACIONAL) {
      throw new BadRequestException(
        'Este motor suporta apenas empresas no Simples Nacional.',
      );
    }

    // 2. RBT12 + faturamento do mês em paralelo
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    const [rbt12, aggregateInvoices, payroll12] = await Promise.all([
      this.calculateRBT12(companyId, month, year),

      this.prisma.invoice.aggregate({
        where: {
          companyId,
          issuedAt: { gte: startDate, lte: endDate },
          status: InvoiceStatus.NORMAL,
          reconciled: true,
        },
        _sum: { amount: true },
      }),

      this.calculatePayroll12(companyId, month, year),
    ]);

    const revenue = new Prisma.Decimal(aggregateInvoices._sum.amount ?? 0); // FIX: || → ??

    // 3. Motor de Decisão: Fator R
    const factorRValue = calculateOfficialFactorR(payroll12, rbt12);

    let appliedAnexo = company.anexo ?? 3;

    if (company.anexo === 5 && factorRValue.gte(0.28)) {
      appliedAnexo = 3;
      this.logger.debug(
        '[Tax-Engine] Benefício Fator R aplicado: migrado para Anexo III.',
      );
    }

    // 4. Alíquota efetiva progressiva
    const effectiveRate = this.calculateEffectiveRate(appliedAnexo, rbt12);
    const taxValue = revenue.mul(effectiveRate);

    // FIX: period mantido como string apenas para exibição — não é mais chave de query
    const period = `${year}-${String(month).padStart(2, '0')}`;

    const result: TaxCalculationResult = {
      period,
      companyName: company.name,
      revenue: revenue.toNumber(),
      rbt12: rbt12.toNumber(),
      payroll: payroll12.toNumber(),
      factorR: Number(factorRValue.mul(100).toFixed(2)),
      appliedAnexo,
      effectiveRate: Number((effectiveRate.toNumber() * 100).toFixed(4)),
      taxAmount: Number(taxValue.toFixed(2)),
      updatedAt: new Date(),
    };

    // 5. Audit Log
    await this.prisma.auditLog.create({
      data: {
        userId,
        companyId,
        action: 'TAX_CALCULATION_GENERATE',
        module: 'FISCAL',
        entity: 'TaxCalculation',
        // 🚀 CORREÇÃO TS2352: Double casting para garantir que o Prisma aceite como JsonValue
        payload: result as unknown as Prisma.InputJsonValue,
        responseTime: Date.now() - startTime,
        statusCode: 200,
      },
    });

    return result;
  }

  async previewMonthlyClosure(
    companyId: string,
    month: number,
    year: number,
    userId: string,
    options: MonthlyTaxPreviewOptions = {},
  ): Promise<MonthlyTaxClosurePreview> {
    const calculation = await this.calculateSimplesNacional(
      companyId,
      month,
      year,
      userId,
    );
    const gates = this.buildMonthlyClosureGates(calculation, options);
    const failed = gates.filter((gate) => gate.status === 'FAIL');
    const warnings = gates.filter((gate) => gate.status === 'WARN');
    const status: MonthlyTaxPreviewStatus =
      failed.length > 0
        ? 'BLOCKED'
        : warnings.length > 0
          ? 'REQUIRES_ACTION'
          : 'READY_TO_CLOSE';

    return {
      status,
      canClose: status === 'READY_TO_CLOSE',
      calculation,
      gates,
      evidenceRequired: [
        'Memória de cálculo do Simples Nacional',
        'Base de receitas reconciliadas da competência',
        'RBT12 e folha dos 12 meses anteriores',
        'Comprovante de certificado/procuração',
        'Revisão CRC antes da transmissão oficial',
        'Recibo PGDAS-D e guia DAS após fechamento',
      ],
      nextActions: this.buildMonthlyClosureNextActions(gates),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Fechamento mensal atômico — gera TaxObligation + persiste TaxCalculation.
   */
  async closeMonthAndGenerateObligation(
    companyId: string,
    month: number,
    year: number,
    userId: string,
  ) {
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const obligationName = `Guia DAS - Simples Nacional - ${period}`;

    const existing = await this.prisma.taxObligation.findFirst({
      where: { companyId, name: obligationName },
    });

    if (existing) {
      throw new ConflictException(
        `A guia de ${period} já foi gerada e está ${existing.status}.`,
      );
    }

    const calc = await this.calculateSimplesNacional(
      companyId,
      month,
      year,
      userId,
    );
    const dueDate = new Date(year, month, 20); // Vencimento padrão: dia 20

    return this.prisma.$transaction(async (tx) => {
      const obligation = await tx.taxObligation.create({
        data: {
          companyId,
          name: obligationName,
          amount: new Prisma.Decimal(calc.taxAmount),
          dueDate,
          status: ObligationStatus.PENDING,
        },
      });

      await tx.taxCalculation.upsert({
        where: { companyId_month_year: { companyId, month, year } },
        update: {
          totalAmount: new Prisma.Decimal(calc.taxAmount),
          rbt12: new Prisma.Decimal(calc.rbt12),
          fatorR: calc.factorR,
          // 🚀 CORREÇÃO TS2352: Double casting para JsonValue
          inputSnapshot: calc as unknown as Prisma.InputJsonValue,
        },
        create: {
          companyId,
          month,
          year,
          totalAmount: new Prisma.Decimal(calc.taxAmount),
          rbt12: new Prisma.Decimal(calc.rbt12),
          fatorR: calc.factorR,
          // 🚀 CORREÇÃO TS2352: Double casting para JsonValue
          inputSnapshot: calc as unknown as Prisma.InputJsonValue,
        },
      });

      return obligation;
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async calculateRBT12(
    companyId: string,
    month: number,
    year: number,
  ): Promise<Prisma.Decimal> {
    // Janela móvel: 12 meses anteriores ao mês de referência (exclusive)
    const startOfRbt = new Date(Date.UTC(year - 1, month - 1, 1));
    const endOfRbt = new Date(Date.UTC(year, month - 1, 0));

    const rbtAggr = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        issuedAt: { gte: startOfRbt, lte: endOfRbt },
        status: InvoiceStatus.NORMAL,
        reconciled: true,
      },
      _sum: { amount: true },
    });

    return new Prisma.Decimal(rbtAggr._sum.amount ?? 0); // FIX: || → ??
  }

  private async calculatePayroll12(
    companyId: string,
    month: number,
    year: number,
  ): Promise<Prisma.Decimal> {
    const payrollAggr = await this.prisma.payroll.aggregate({
      where: {
        companyId,
        OR: [
          { year, month: { lt: month } },
          { year: year - 1, month: { gte: month } },
        ],
      },
      _sum: { totalAmount: true },
    });

    return new Prisma.Decimal(payrollAggr._sum.totalAmount ?? 0);
  }

  /**
   * Alíquotas Progressivas Simples Nacional 2026.
   * Fórmula: (RBT12 × Alíquota Nominal − Parcela a Deduzir) / RBT12
   */
  private calculateEffectiveRate(
    anexo: number,
    rbt12: Prisma.Decimal,
  ): Prisma.Decimal {
    const rbt = rbt12.toNumber();

    if (anexo !== 3 && anexo !== 5) {
      return new Prisma.Decimal(0.04);
    }

    const table = SIMPLES_TABLES[anexo];
    const bracket =
      table.find((item) => rbt <= item.limit) ?? table[table.length - 1];

    if (rbt12.isZero()) return new Prisma.Decimal(bracket.rate);

    return rbt12.mul(bracket.rate).minus(bracket.deduction).div(rbt12);
  }

  private buildMonthlyClosureGates(
    calculation: TaxCalculationResult,
    options: MonthlyTaxPreviewOptions,
  ): MonthlyTaxClosurePreview['gates'] {
    return [
      {
        code: 'REVENUE_RECONCILIATION',
        label: 'Receitas reconciliadas',
        status:
          options.hasRevenueReconciliation === true || calculation.revenue > 0
            ? 'PASS'
            : 'WARN',
        message:
          options.hasRevenueReconciliation === true || calculation.revenue > 0
            ? 'Base de faturamento disponível para a competência.'
            : 'Confirme XMLs/notas e conciliação antes de fechar a competência.',
      },
      {
        code: 'DIGITAL_CERTIFICATE',
        label: 'Certificado ou procuração',
        status: options.hasDigitalCertificate === true ? 'PASS' : 'FAIL',
        message:
          options.hasDigitalCertificate === true
            ? 'Credencial oficial declarada para transmissão/consulta.'
            : 'Fechamento oficial bloqueado sem certificado digital ou procuração válida.',
      },
      {
        code: 'OFFICIAL_PORTAL_ACCESS',
        label: 'Acesso ao Portal do Simples Nacional',
        status: options.hasOfficialPortalAccess === true ? 'PASS' : 'FAIL',
        message:
          options.hasOfficialPortalAccess === true
            ? 'Acesso oficial declarado para PGDAS-D/DAS.'
            : 'Fechamento oficial bloqueado sem acesso ao portal oficial.',
      },
      {
        code: 'CRC_REVIEW',
        label: 'Revisão técnica CRC',
        status: options.hasCrcReview === true ? 'PASS' : 'FAIL',
        message:
          options.hasCrcReview === true
            ? 'Revisão técnica declarada antes da obrigação oficial.'
            : 'Fechamento oficial exige revisão de contador responsável.',
      },
      {
        code: 'FACTOR_R',
        label: 'Fator R',
        status: calculation.factorR >= 28 ? 'PASS' : 'WARN',
        message:
          calculation.factorR >= 28
            ? 'Fator R igual ou superior a 28%, elegível ao Anexo III quando aplicável.'
            : 'Fator R abaixo de 28%, validar tributação no Anexo V e possível ajuste de pró-labore.',
      },
    ];
  }

  private buildMonthlyClosureNextActions(
    gates: MonthlyTaxClosurePreview['gates'],
  ): string[] {
    const actions = gates
      .filter((gate) => gate.status !== 'PASS')
      .map((gate) => `${gate.label}: ${gate.message}`);

    if (actions.length > 0) return actions;

    return [
      'Fechar competência, persistir snapshot fiscal e gerar obrigação DAS pendente.',
      'Transmitir/registrar PGDAS-D com evidência oficial e anexar recibo.',
    ];
  }
}
