'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { subDays } from 'date-fns';

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 🔍 Motor de Auditoria Estatística: Detecta desvios de padrão financeiro.
   */
  async detectAnomalies(companyId: string, days: number = 30) {
    this.logger.debug(
      `🔬 Analisando comportamento estatístico: Empresa ${companyId}`,
    );

    const startDate = subDays(new Date(), days);

    const transactions = await this.prisma.bankTransaction.findMany({
      where: {
        companyId,
        occurredAt: { gte: startDate },
      },
      include: {
        bankAccount: true,
        invoice: true,
        taxObligation: true,
      },
    });

    if (transactions.length < 5) {
      this.logger.warn(
        `Massa de dados insuficiente para Company ${companyId} (${transactions.length} transações).`,
      );
      return [];
    }

    // 1. Cálculo de Métricas (Média e Desvio Padrão)
    const amounts = transactions.map((t) => Math.abs(Number(t.amount)));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // Fórmula do Desvio Padrão: $inline$\sigma = \sqrt{\frac{\sum(x_i - \mu)^2}{N}}$
    const stdDev =
      Math.sqrt(
        amounts.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) /
          amounts.length,
      ) || 1;

    // 2. Filtro, Enriquecimento e Classificação
    const threshold = 2 * stdDev;

    const anomalies = transactions
      .map((t) => {
        const amount = Math.abs(Number(t.amount));
        const diff = Math.abs(amount - mean);

        // Z-Score: Quão longe da média o valor está em unidades de desvio padrão
        const deviationScore = diff / stdDev;
        const isAnomalous = diff > threshold;

        return {
          ...t,
          deviationScore: Number(deviationScore.toFixed(2)),
          isAnomalous,
          // Adição: Metadados de Auditoria para o Frontend
          auditContext: {
            averageForPeriod: Number(mean.toFixed(2)),
            differenceFromMean: Number(diff.toFixed(2)),
            severity: this.getSeverity(deviationScore),
            reason: this.determineReason(t, deviationScore),
          },
        };
      })
      .filter((t) => t.isAnomalous)
      .sort((a, b) => b.deviationScore - a.deviationScore);

    // 3. Persistência de Auditoria (Opcional: Pode disparar notificações aqui)
    if (anomalies.length > 0) {
      this.logger.log(
        `🚨 ${anomalies.length} anomalias críticas detectadas para Company ${companyId}`,
      );
    }

    return anomalies;
  }

  /**
   * Determina a severidade baseada no desvio padrão (Z-Score)
   */
  private getSeverity(zScore: number): 'LOW' | 'MEDIUM' | 'CRITICAL' {
    if (zScore > 5) return 'CRITICAL';
    if (zScore > 3) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Tenta deduzir o motivo da anomalia com base no contexto do banco
   */
  private determineReason(transaction: any, zScore: number): string {
    if (!transaction.invoiceId && transaction.type === 'CREDIT') {
      return 'Receita sem Nota Fiscal vinculada (Risco Fiscal)';
    }
    if (zScore > 5) {
      return 'Valor extremamente fora do padrão histórico da empresa';
    }
    if (transaction.taxObligationId && zScore > 3) {
      return 'Pagamento de imposto com valor atípico';
    }
    return 'Desvio de padrão estatístico recorrente';
  }

  // --- 🟢 ADIÇÃO: FUNÇÃO DE AUDITORIA DE INTEGRIDADE ---

  /**
   * 🛡️ Cruzamento de Dados: NF-e vs Transações Bancárias
   * Verifica se os valores recebidos batem com o valor da nota.
   */
  async auditInvoiceIntegrity(companyId: string) {
    this.logger.log(`🛡️ Auditando integridade de notas para: ${companyId}`);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: 'NORMAL' },
      include: {
        bankTransaction: true, // Nome corrigido conforme seu Prisma Schema
      },
    });

    return invoices
      .filter((inv) => {
        // Busca as transações vinculadas à nota
        const txs = (inv as any).bankTransaction || [];
        const totalPaid = txs.reduce(
          (sum: number, t: any) => sum + Number(t.amount),
          0,
        );

        // Retorna apenas se houver diferença entre a nota e o banco
        return Math.abs(totalPaid - Number(inv.amount)) > 0.01;
      })
      .map((inv) => ({
        invoiceId: inv.id,
        amount: Number(inv.amount),
        date: inv.issuedAt,
        status: 'DISCREPANCY',
        message: 'Divergência entre valor da nota e transações bancárias.',
      }));
  }
}
