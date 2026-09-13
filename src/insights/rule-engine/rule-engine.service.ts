'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationService } from '../../modules/notifications/notification.service.js';
import {
  CashFlowProjectionService,
  ProjectionItem,
} from '../cash-flow-projection/cash-flow-projection.service.js';
import { AnomalyDetectionService } from '../anomaly-detection/anomaly-detection.service.js';
import type { EnrichedAnomaly } from '../anomaly-detection/anomaly-detection.service.js';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private cashFlowService: CashFlowProjectionService,
    private anomalyService: AnomalyDetectionService,
  ) {}

  /**
   * Executa todas as regras de negócio para uma empresa específica.
   */
  async evaluateCompanyRules(companyId: string): Promise<void> {
    this.logger.debug(
      `🛡️ Rodando motor de regras bCost para empresa: ${companyId}`,
    );

    // Executa em paralelo para máxima performance
    await Promise.allSettled([
      this.checkFactorR(companyId),
      this.checkCertificateExpiration(companyId),
      this.checkCashFlowAlert(companyId),
      this.checkRecentAnomalies(companyId),
    ]);
  }

  /**
   * 1. Fator R: Alerta se estiver abaixo de 28%
   */
  private async checkFactorR(companyId: string): Promise<void> {
    const latestTaxCalc = await this.prisma.taxCalculation.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestTaxCalc || latestTaxCalc.fatorR === null) return;

    const fatorR = latestTaxCalc.fatorR;
    if (fatorR < 28) {
      await this.notificationService.createNotification({
        companyId,
        type: 'FACTOR_R_ALERT',
        severity: 'WARNING',
        title: 'Risco Fiscal: Fator R baixo',
        message: `Seu Fator R está em ${fatorR.toFixed(2)}%. Abaixo de 28%, você pode ser tributado pelo Anexo V (mais caro).`,
        metadata: { currentFatorR: fatorR, target: 28 },
      });
    }
  }

  /**
   * 2. Certificados: Alerta de vencimento iminente
   */
  private async checkCertificateExpiration(companyId: string): Promise<void> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringCerts = await this.prisma.digitalCertificate.findMany({
      where: {
        companyId,
        validTo: { lte: thirtyDaysFromNow },
        status: 'ACTIVE',
      },
    });

    for (const cert of expiringCerts) {
      const daysToExpire = Math.ceil(
        (cert.validTo.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );

      await this.notificationService.createNotification({
        companyId,
        type: 'CERT_EXPIRATION',
        severity: daysToExpire <= 7 ? 'CRITICAL' : 'WARNING',
        title: 'Certificado Digital Vencendo',
        message: `O certificado ${cert.issuer} expira em ${daysToExpire} dias. Evite a interrupção da emissão de notas.`,
        metadata: { certificateId: cert.id, daysRemaining: daysToExpire },
      });
    }
  }

  /**
   * 3. Fluxo de Caixa: Alerta de insolvência técnica (Saldo Negativo)
   */
  private async checkCashFlowAlert(companyId: string): Promise<void> {
    // CORREÇÃO DE TIPAGEM: Buscamos o registro bruto para evitar erro de propriedade inexistente
    const projectionRecord = await this.prisma.cashFlowProjection.findFirst({
      where: { companyId },
      orderBy: { projectionDate: 'desc' },
    });

    if (!projectionRecord || !projectionRecord.data) return;

    const data = projectionRecord.data as unknown as ProjectionItem[];

    // Analisamos a curto prazo (próxima semana)
    const next7Days = data.slice(0, 7);
    const negativeDays = next7Days.filter((day) => day.projectedBalance < 0);

    if (negativeDays.length >= 2) {
      await this.notificationService.createNotification({
        companyId,
        type: 'PREDICTIVE_CASHFLOW_ALERT',
        severity: 'CRITICAL',
        title: 'Alerta de Caixa: Saldo Negativo',
        message: `Atenção! Nossa IA detectou ${negativeDays.length} dias de saldo negativo na próxima semana.`,
        metadata: { criticalDates: negativeDays.map((d) => d.date) },
      });
    }
  }

  /**
   * 4. Anomalias: Alerta de Compliance e Auditoria
   */
  private async checkRecentAnomalies(companyId: string): Promise<void> {
    // Buscamos anomalias reais dos últimos 7 dias
    const anomalies = await this.anomalyService.detectAnomalies(companyId, 7);

    // Filtramos apenas as de desvio alto (deviationScore > 3) para não poluir com notificações INFO
    const criticalAnomalies = anomalies.filter(
      (anomaly: EnrichedAnomaly) => anomaly.deviationScore > 3,
    );

    if (criticalAnomalies.length > 0) {
      await this.notificationService.createNotification({
        companyId,
        type: 'COMPLIANCE_ISSUE',
        severity: 'WARNING',
        title: 'Transações Atípicas Detectadas',
        message: `Identificamos ${criticalAnomalies.length} movimentações fora do padrão normal da empresa este mês.`,
        metadata: { count: criticalAnomalies.length },
      });
    }
  }
}
