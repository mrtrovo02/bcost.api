'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { InvoiceStatus, ObligationStatus } from '@prisma/client';

/**
 * Serviço de Fluxo de Caixa e Projeção Financeira.
 * Focado em fornecer visibilidade de liquidez futura baseada em documentos fiscais e obrigações.
 */
@Injectable()
export class CashFlowService {
  private readonly logger = new Logger(CashFlowService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Projeção de Caixa: Realizado vs Previsto.
   * Analisa o saldo atual em conta (balanceCache) somado aos recebíveis de notas fiscais
   * subtraindo as obrigações tributárias e de folha pendentes.
   */
  async getProjection(companyId: string, days: number = 30) {
    const horizonDate = new Date();
    horizonDate.setDate(horizonDate.getDate() + days);

    try {
      // Execução em paralelo para performance máxima (I/O non-blocking)
      const [bankBalance, pendingReceivables, pendingObligations] =
        await Promise.all([
          // 1. Saldo Real Acumulado de todas as contas
          this.prisma.bankAccount.aggregate({
            where: { companyId },
            _sum: { balanceCache: true },
          }),

          // 2. Recebíveis Previstos (Invoices que ainda não foram pagas/conciliadas)
          // 🚀 AJUSTE: Incluindo PENDING para bater com os dados do Seed
          this.prisma.invoice.aggregate({
            where: {
              companyId,
              reconciled: false,
              status: { in: [InvoiceStatus.PENDING, InvoiceStatus.NORMAL] },
              issuedAt: { lte: horizonDate },
            },
            _sum: { amount: true },
          }),

          // 3. Obrigações Previstas (DAS, GPS, Folha de Pagamento)
          this.prisma.taxObligation.aggregate({
            where: {
              companyId,
              status: ObligationStatus.PENDING,
              dueDate: { lte: horizonDate },
            },
            _sum: { amount: true },
          }),
        ]);

      // Conversão segura de Decimal para Number para cálculos de Dashboard
      const totalReal = Number(bankBalance._sum?.balanceCache || 0);
      const totalIn = Number(pendingReceivables._sum?.amount || 0);
      const totalOut = Number(pendingObligations._sum?.amount || 0);

      const estimatedFinalBalance = totalReal + totalIn - totalOut;

      return {
        companyId,
        projectionHorizonDays: days,
        metrics: {
          currentBalance: totalReal,
          projectedInflow: totalIn,
          projectedOutflow: totalOut,
          estimatedFinalBalance: estimatedFinalBalance,
        },
        analysis: {
          healthIndex: this.calculateHealth(totalReal, totalIn, totalOut),
          // Evita divisão por zero (Infinity) usando fallback para 1
          liquidityRatio: Number(
            ((totalReal + totalIn) / (totalOut || 1)).toFixed(2),
          ),
        },
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `❌ Erro na projeção financeira [Empresa: ${companyId}]:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Calcula o índice de saúde financeira baseado em margem de segurança.
   */
  private calculateHealth(
    real: number,
    inFlow: number,
    outFlow: number,
  ): 'EXCELLENT' | 'WARNING' | 'CRITICAL' {
    const totalAvailable = real + inFlow;

    if (outFlow === 0) return totalAvailable > 0 ? 'EXCELLENT' : 'WARNING';

    const margin = totalAvailable / outFlow;

    // Lógica bCost: Ter 50% de reserva sobre o que deve sair é o ideal
    if (margin > 1.5) return 'EXCELLENT';
    if (margin >= 1.0) return 'WARNING';
    return 'CRITICAL';
  }
}
