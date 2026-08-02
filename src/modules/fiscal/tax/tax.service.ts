'use strict';

import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { InvoiceStatus, TransactionType } from '@prisma/client';

/**
 * Tabelas Oficiais do Simples Nacional (2026)
 */
const ANEXO_III = [
  { limite: 180000, aliq: 0.06, deducao: 0 },
  { limite: 360000, aliq: 0.112, deducao: 9360 },
  { limite: 720000, aliq: 0.135, deducao: 17640 },
  { limite: 1800000, aliq: 0.16, deducao: 35640 },
  { limite: 3600000, aliq: 0.21, deducao: 125640 },
  { limite: 4800000, aliq: 0.33, deducao: 648000 },
];

const ANEXO_V = [
  { limite: 180000, aliq: 0.155, deducao: 0 },
  { limite: 360000, aliq: 0.18, deducao: 4500 },
  { limite: 720000, aliq: 0.195, deducao: 9900 },
  { limite: 1800000, aliq: 0.205, deducao: 17100 },
  { limite: 3600000, aliq: 0.23, deducao: 62100 },
  { limite: 4800000, aliq: 0.305, deducao: 540000 },
];

function calculateFactorRPercent(payroll12: number, rbt12: number): number {
  if (payroll12 > 0 && rbt12 === 0) return 28;
  if (payroll12 === 0 && rbt12 === 0) return 1;
  if (payroll12 === 0 && rbt12 > 0) return 1;
  return (payroll12 / rbt12) * 100;
}

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 📉 CALCULAR IMPOSTO MENSAL (CÁLCULO REAL)
   * Executa a apuração completa baseada em notas fiscais e folha.
   */
  async calculateMonthlyTax(companyId: string, month: number, year: number) {
    try {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) throw new NotFoundException('Empresa não localizada.');

      const integrity = await this.validateHistoryIntegrity(companyId);

      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      const past12Start = new Date(Date.UTC(year, month - 13, 1));
      const past12End = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59));

      const [monthlyInvoices, rbt12Result, folha12Result, bankSum] =
        await Promise.all([
          this.prisma.invoice.aggregate({
            where: {
              companyId,
              status: InvoiceStatus.NORMAL,
              issuedAt: { gte: startDate, lte: endDate },
            },
            _sum: { amount: true },
          }),
          this.prisma.invoice.aggregate({
            where: {
              companyId,
              status: InvoiceStatus.NORMAL,
              issuedAt: { gte: past12Start, lte: past12End },
            },
            _sum: { amount: true },
          }),
          this.prisma.payroll.aggregate({
            where: {
              companyId,
              OR: [
                { year: year, month: { lt: month } },
                { year: year - 1, month: { gte: month } },
              ],
            },
            _sum: { totalAmount: true },
          }),
          this.prisma.bankTransaction.aggregate({
            where: {
              companyId,
              occurredAt: { gte: startDate, lte: endDate },
              type: TransactionType.CREDIT,
            },
            _sum: { amount: true },
          }),
        ]);

      const totalRevenue = Number(monthlyInvoices._sum?.amount || 0);
      const bankRevenue = Number(bankSum._sum?.amount || 0);
      let rbt12 = Number(rbt12Result._sum?.amount || 0);
      let folha12 = Number(folha12Result._sum?.totalAmount || 0);

      // Normalização para empresas com menos de 12 meses (Regra da média ponderada)
      if (integrity.isNewCompany && integrity.monthsFound < 12) {
        const activeMonths = Math.max(integrity.monthsFound, 1);
        rbt12 = (rbt12 / activeMonths) * 12;
        folha12 = (folha12 / activeMonths) * 12;
      }

      const fatorRPercent = calculateFactorRPercent(folha12, rbt12);
      const anexoEfetivo = fatorRPercent >= 28 ? 3 : 5;
      const { aliqEfetiva, faixa } = this.getEffectiveRate(rbt12, anexoEfetivo);
      const anexoIIIRate = this.getEffectiveRate(rbt12, 3).aliqEfetiva;
      const taxAmount = totalRevenue * aliqEfetiva;

      return {
        month,
        year,
        metrics: {
          faturamentoMes: totalRevenue,
          rbt12: Number(rbt12.toFixed(2)),
          fatorR: Number(fatorRPercent.toFixed(2)),
          aliqEfetiva: Number((aliqEfetiva * 100).toFixed(4)),
          anexoUtilizado: `Anexo ${anexoEfetivo === 3 ? 'III' : 'V'}`,
          faixaSugerida: faixa,
        },
        compliance: {
          divergenciaBancaria: bankRevenue > totalRevenue * 1.05,
          bankRevenue: bankRevenue,
          valorEmAberto: Math.max(bankRevenue - totalRevenue, 0),
        },
        financial: {
          impostoAPagar: Number(taxAmount.toFixed(2)),
          taxPayable: Number(taxAmount.toFixed(2)),
          gapFolhaMensal: Number(
            (Math.max(rbt12 * 0.28 - folha12, 0) / 12).toFixed(2),
          ),
          economiaFatorR: Number(
            (anexoEfetivo === 5
              ? totalRevenue * (aliqEfetiva - anexoIIIRate)
              : 0
            ).toFixed(2),
          ),
        },
        audit: integrity,
      };
    } catch (error: any) {
      this.logger.error(`[TaxEngine Fail] ${month}/${year}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🚀 SIMULAR CENÁRIO (RESOLVE O ERRO TS2339)
   * Permite projetar impostos baseados em um faturamento hipotético.
   */
  async simulateTaxScenario(companyId: string, projectedRevenue: number) {
    if (projectedRevenue < 0)
      throw new BadRequestException(
        'A receita projetada não pode ser negativa.',
      );

    // Busca o RBT12 atual para simular com a alíquota correta do cliente
    const rbt12Data = await this.prisma.invoice.aggregate({
      where: { companyId, status: InvoiceStatus.NORMAL },
      _sum: { amount: true },
    });

    const rbt12 = Number(rbt12Data._sum?.amount || 0);
    // Simula no Anexo III (padrão bCost para serviços)
    const { aliqEfetiva, faixa } = this.getEffectiveRate(rbt12, 3);

    return {
      projectedRevenue: Number(projectedRevenue.toFixed(2)),
      estimatedTax: Number((projectedRevenue * aliqEfetiva).toFixed(2)),
      effectiveRate: Number((aliqEfetiva * 100).toFixed(2)),
      taxBracket: faixa,
      message:
        'Projeção baseada no faturamento histórico dos últimos 12 meses.',
    };
  }

  /**
   * 📊 HISTÓRICO ANUAL
   */
  async getYearlyPerformance(companyId: string, year: number) {
    const data = await this.prisma.financialSnapshot.findMany({
      where: { companyId, year },
      orderBy: { month: 'asc' },
    });

    return data.map((d) => ({
      month: d.month,
      revenue: Number(d.revenue),
      tax: Number(d.taxPayable),
      status: 'ok',
      profitMargin:
        Number(d.revenue) > 0
          ? ((Number(d.revenue) - Number(d.taxPayable)) / Number(d.revenue)) *
            100
          : 0,
    }));
  }

  /**
   * 🛡️ AUDITORIA DE INTEGRIDADE
   */
  async validateHistoryIntegrity(companyId: string) {
    const count = await this.prisma.financialSnapshot.count({
      where: { companyId },
    });
    return {
      isNewCompany: count < 12,
      monthsFound: count,
      isComplete: count >= 12,
      status: count >= 12 ? 'AUDIT_READY' : 'INCOMPLETE_DATA',
    };
  }

  /**
   * 🧮 MOTOR DE CÁLCULO DE ALÍQUOTA (EFETIVA)
   */
  private getEffectiveRate(rbt12: number, anexo: number) {
    const tabela = anexo === 3 ? ANEXO_III : ANEXO_V;
    const faixaIdx = tabela.findIndex((f) => rbt12 <= f.limite);
    const faixa =
      faixaIdx === -1 ? tabela[tabela.length - 1] : tabela[faixaIdx];

    // Fórmula oficial do Simples Nacional: (RBT12 * Alíquota - Dedução) / RBT12
    const aliqEfetiva =
      rbt12 > 0 ? (rbt12 * faixa.aliq - faixa.deducao) / rbt12 : tabela[0].aliq;

    return {
      aliqEfetiva: Math.max(aliqEfetiva, 0),
      faixa: faixaIdx === -1 ? 6 : faixaIdx + 1,
    };
  }
}
