import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Interface para estruturação das anomalias detectadas.
 */
export interface AnomalyResult {
  type: 'DUPLICITY' | 'OUTLIER' | 'TREND_SHIFT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  transactionId?: string;
  metadata?: any;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  // Configurações de Threshold para Produção
  private readonly CONFIG = {
    MIN_TRANSACTIONS_FOR_Z_SCORE: 30,
    Z_SCORE_THRESHOLD: 2.5, // Desvio padrão para considerar anomalia (Z-Score)
    DUPLICITY_WINDOW_DAYS: 3,
  };

  constructor(private prisma: PrismaService) {}

  /**
   * Ponto de entrada principal para análise de anomalias por empresa.
   * Executa heurísticas rápidas e modelos estatísticos dependendo da massa de dados.
   */
  async processCompanyAnomalies(companyId: string): Promise<AnomalyResult[]> {
    try {
      this.logger.log(
        `Iniciando detecção de anomalias para a empresa: ${companyId}`,
      );

      // Busca as últimas transações respeitando o camelCase do schema identificado
      const transactions = await this.prisma.bankTransaction.findMany({
        where: { companyId },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      });

      if (!transactions || transactions.length === 0) {
        this.logger.warn(
          `Massa de dados insuficiente para a empresa ${companyId}.`,
        );
        return [];
      }

      const anomalies: AnomalyResult[] = [];

      // 1. Detecção de Duplicidade (Regra de Negócio Crítica)
      const duplicityAnomalies = this.detectDuplicity(transactions);
      anomalies.push(...duplicityAnomalies);

      // 2. Detecção de Outliers (Z-Score para dados maduros ou Heurística para iniciantes)
      if (transactions.length >= this.CONFIG.MIN_TRANSACTIONS_FOR_Z_SCORE) {
        anomalies.push(...this.detectZScoreOutliers(transactions));
      } else {
        anomalies.push(...this.detectBasicOutliers(transactions));
      }

      // 3. Persistência dos resultados no Log de Auditoria para visualização no Dashboard
      if (anomalies.length > 0) {
        await this.logAnomaliesToAudit(companyId, anomalies);
      }

      return anomalies;
    } catch (error) {
      this.logger.error(
        `Falha crítica no AnomalyDetectionService para empresa ${companyId}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Detecta transações idênticas em uma janela curta de tempo (Possível erro humano ou falha de sistema).
   */
  private detectDuplicity(txs: any[]): AnomalyResult[] {
    const results: AnomalyResult[] = [];

    for (let i = 0; i < txs.length; i++) {
      for (let j = i + 1; j < txs.length; j++) {
        const t1 = txs[i];
        const t2 = txs[j];

        const sameAmount = new Decimal(t1.amount).equals(
          new Decimal(t2.amount),
        );
        const sameDesc = t1.description === t2.description;

        const diffTime = Math.abs(
          t1.occurredAt.getTime() - t2.occurredAt.getTime(),
        );
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (
          sameAmount &&
          sameDesc &&
          diffDays <= this.CONFIG.DUPLICITY_WINDOW_DAYS
        ) {
          results.push({
            type: 'DUPLICITY',
            severity: 'MEDIUM',
            description: `Transação duplicada suspeita: "${t1.description}" no valor de R$ ${t1.amount}`,
            transactionId: t1.id,
            metadata: { duplicateOf: t2.id, daysDiff: diffDays.toFixed(1) },
          });
        }
      }
    }
    return results;
  }

  /**
   * Detecção estatística baseada em Z-Score (Desvio Padrão).
   */
  private detectZScoreOutliers(txs: any[]): AnomalyResult[] {
    const amounts = txs.map((t) => Math.abs(Number(t.amount)));
    const n = amounts.length;
    const mean = amounts.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(
      amounts.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n,
    );

    return txs
      .filter((t) => {
        const val = Math.abs(Number(t.amount));
        const zScore = stdDev === 0 ? 0 : Math.abs((val - mean) / stdDev);
        return zScore > this.CONFIG.Z_SCORE_THRESHOLD;
      })
      .map((t) => ({
        type: 'OUTLIER',
        severity: 'HIGH',
        description: `Anomalia de valor: Transação de R$ ${t.amount} está muito acima da média histórica.`,
        transactionId: t.id,
        metadata: {
          zScore:
            stdDev === 0
              ? 0
              : ((Math.abs(Number(t.amount)) - mean) / stdDev).toFixed(2),
          average: mean.toFixed(2),
        },
      }));
  }

  /**
   * Detecção básica por mediana para o cenário de "Cold Start".
   */
  private detectBasicOutliers(txs: any[]): AnomalyResult[] {
    const sortedTxs = [...txs].sort(
      (a, b) => Math.abs(Number(a.amount)) - Math.abs(Number(b.amount)),
    );
    const median = Math.abs(
      Number(sortedTxs[Math.floor(sortedTxs.length / 2)].amount),
    );

    return txs
      .filter(
        (t) =>
          Math.abs(Number(t.amount)) > median * 5 &&
          Math.abs(Number(t.amount)) > 500,
      )
      .map((t) => ({
        type: 'OUTLIER',
        severity: 'LOW',
        description: `Valor incomum detectado para o histórico inicial desta empresa.`,
        transactionId: t.id,
        metadata: { medianValue: median },
      }));
  }

  /**
   * Persiste o resultado no banco de dados seguindo o schema de auditoria (audit_logs).
   */
  private async logAnomaliesToAudit(
    companyId: string,
    anomalies: AnomalyResult[],
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'ANOMALY_DETECTION_RUN',
          module: 'ANALYTICS_ENGINE',
          companyId: companyId,
          payload: {
            found: anomalies.length,
            details: anomalies,
          } as any,
          statusCode: 200,
          userAgent: 'SYSTEM_WORKER_IA',
        },
      });
    } catch (err) {
      this.logger.error(
        `Erro ao salvar log de anomalias para ${companyId}`,
        err,
      );
    }
  }
}
