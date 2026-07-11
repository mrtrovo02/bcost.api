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
  // 🚀 CORREÇÃO TS2352: Assinatura de índice para garantir compatibilidade com JsonValue
  [key: string]: any;
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

    const [rbt12, aggregateInvoices, payroll] = await Promise.all([
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

      // FIX: referenceMonth: referenceStr → month + year como Int
      this.prisma.payroll.findFirst({
        where: { companyId, month, year },
      }),
    ]);

    const revenue = new Prisma.Decimal(aggregateInvoices._sum.amount ?? 0); // FIX: || → ??
    const payrollValue = new Prisma.Decimal(payroll?.totalAmount ?? 0); // FIX: || → ??

    // 3. Motor de Decisão: Fator R
    const factorRValue = revenue.isZero()
      ? 0
      : payrollValue.div(revenue).toNumber();

    let appliedAnexo = company.anexo ?? 3;

    if (company.anexo === 5 && factorRValue >= 0.28) {
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
      payroll: payrollValue.toNumber(),
      factorR: Number((factorRValue * 100).toFixed(2)),
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

  /**
   * Alíquotas Progressivas Simples Nacional 2026.
   * Fórmula: (RBT12 × Alíquota Nominal − Parcela a Deduzir) / RBT12
   */
  private calculateEffectiveRate(
    anexo: number,
    rbt12: Prisma.Decimal,
  ): Prisma.Decimal {
    const rbt = rbt12.toNumber();

    if (anexo === 3) {
      if (rbt <= 180_000) return new Prisma.Decimal(0.06);
      if (rbt <= 360_000) return rbt12.mul(0.112).minus(9_360).div(rbt12);
      if (rbt <= 720_000) return rbt12.mul(0.135).minus(17_640).div(rbt12);
      if (rbt <= 1_800_000) return rbt12.mul(0.16).minus(35_640).div(rbt12);
      return new Prisma.Decimal(0.19);
    }

    if (anexo === 5) {
      if (rbt <= 180_000) return new Prisma.Decimal(0.155);
      if (rbt <= 360_000) return rbt12.mul(0.18).minus(4_500).div(rbt12);
      return new Prisma.Decimal(0.205);
    }

    return new Prisma.Decimal(0.04);
  }
}
