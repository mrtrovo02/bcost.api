'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreatePayrollDto } from './dto/create-payroll.dto.js';
import { Prisma, InvoiceStatus } from '@prisma/client';

export interface FactorRResult {
  competenciaReferencia: string;
  analise12Meses: {
    faturamentoAcumulado: number;
    massaSalarialAcumulada: number;
  };
  diagnostico: {
    fatorR: number;
    isEligibleAnexoIII: boolean;
    valorNecessarioParaAtingir28: number;
  };
  insight: string;
}

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);
  private readonly FACTOR_R_THRESHOLD = 0.28;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Histórico completo para auditoria e conferência.
   * Adaptado para ordenar por Year e Month.
   */
  async getCompanyPayrollHistory(companyId: string) {
    this.logger.log(
      `[Payroll] Buscando histórico completo para empresa ${companyId}`,
    );
    return await this.prisma.payroll.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
    });
  }

  /**
   * Registro de Folha utilizando os novos campos numéricos do Prisma.
   */
  async createPayrollRecord(companyId: string, data: CreatePayrollDto) {
    this.logger.log(
      `[Payroll] Registrando competência ${data.month}/${data.year} para empresa ${companyId}`,
    );

    try {
      // Usamos findFirst com a dupla month/year (Substitui referenceMonth)
      const existing = await this.prisma.payroll.findFirst({
        where: {
          companyId,
          month: data.month,
          year: data.year,
        },
      });

      if (existing) {
        return await this.prisma.payroll.update({
          where: { id: existing.id },
          data: {
            totalAmount: new Prisma.Decimal(data.amount),
            // Atualizamos campos auxiliares se existirem no seu DTO
            salariesAmount: data.salariesAmount
              ? new Prisma.Decimal(data.salariesAmount)
              : existing.salariesAmount,
            proLaboreAmount: data.proLaboreAmount
              ? new Prisma.Decimal(data.proLaboreAmount)
              : existing.proLaboreAmount,
          },
        });
      }

      return await this.prisma.payroll.create({
        data: {
          companyId,
          month: data.month,
          year: data.year,
          totalAmount: new Prisma.Decimal(data.amount),
          salariesAmount: data.salariesAmount
            ? new Prisma.Decimal(data.salariesAmount)
            : 0,
          proLaboreAmount: data.proLaboreAmount
            ? new Prisma.Decimal(data.proLaboreAmount)
            : 0,
        },
      });
    } catch (error: any) {
      this.logger.error(`[Payroll Error] ${error.message}`);
      throw new BadRequestException(
        'Falha ao persistir folha no banco. Verifique os dados.',
      );
    }
  }

  /**
   * Diagnóstico de Fator R (Core Fiscal bCost)
   * Realiza a análise preditiva baseada nos 12 meses anteriores.
   */
  async getFactorRDiagnostics(
    companyId: string,
    targetMonth: number,
    targetYear: number,
  ): Promise<FactorRResult> {
    const targetRef = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    // 1. Range de faturamento (Invoices usam issuedAt: Date)
    const startDate = new Date(Date.UTC(targetYear - 1, targetMonth - 1, 1));
    const endDate = new Date(
      Date.UTC(targetYear, targetMonth - 1, 0, 23, 59, 59),
    );

    // 2. Montagem de filtros para folha (agora por pares de Mês/Ano)
    const pastMonthsConditions: Prisma.PayrollWhereInput[] = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(Date.UTC(targetYear, targetMonth - i - 1, 1));
      pastMonthsConditions.push({
        month: d.getUTCMonth() + 1,
        year: d.getUTCFullYear(),
      });
    }

    // 3. Agregação em paralelo (Performance de Elite)
    const [revenueData, payrollData] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          status: InvoiceStatus.NORMAL,
          issuedAt: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
      this.prisma.payroll.aggregate({
        where: {
          companyId,
          OR: pastMonthsConditions, // Busca exata pelos meses decompostos
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const rbt12 = new Prisma.Decimal(revenueData._sum?.amount || 0);
    const folha12 = new Prisma.Decimal(payrollData._sum?.totalAmount || 0);

    const ratio = rbt12.isZero() ? 0 : folha12.div(rbt12).toNumber();
    const factorRPercent = Number((ratio * 100).toFixed(2));
    const isEligible = ratio >= this.FACTOR_R_THRESHOLD;

    const shortfall = !isEligible
      ? rbt12.mul(this.FACTOR_R_THRESHOLD).minus(folha12).toNumber()
      : 0;

    return {
      competenciaReferencia: targetRef,
      analise12Meses: {
        faturamentoAcumulado: rbt12.toNumber(),
        massaSalarialAcumulada: folha12.toNumber(),
      },
      diagnostico: {
        fatorR: factorRPercent,
        isEligibleAnexoIII: isEligible,
        valorNecessarioParaAtingir28:
          shortfall > 0 ? Number(shortfall.toFixed(2)) : 0,
      },
      insight: isEligible
        ? '✅ Fator R ideal! Sua empresa está elegível ao Anexo III (alíquota reduzida).'
        : `🚨 Alerta: Fator R em ${factorRPercent}%. Sua tributação será pelo Anexo V. Aporte R$ ${shortfall.toFixed(2)} em Pró-labore para reduzir o imposto.`,
    };
  }

  /**
   * Estatísticas de folha para o Dashboard de BI.
   */
  async getPayrollStats(companyId: string) {
    const records = await this.prisma.payroll.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
    });

    if (records.length === 0) {
      return {
        resumo: { ultimoLancamento: 0, mediaAnual: 0, totalAcumulado: 0 },
        history: [],
      };
    }

    const totalYear = records.reduce(
      (sum, rec) => sum.plus(rec.totalAmount),
      new Prisma.Decimal(0),
    );

    return {
      resumo: {
        ultimoLancamento: Number(records[0].totalAmount),
        mediaAnual: Number(totalYear.div(records.length).toFixed(2)),
        totalAcumulado: totalYear.toNumber(),
      },
      history: records.map((r) => ({
        competencia: `${r.year}-${String(r.month).padStart(2, '0')}`, // Reconstroi string para o front
        valor: Number(r.totalAmount),
        data: r.createdAt,
      })),
    };
  }
}
