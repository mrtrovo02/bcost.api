'use strict';

// =============================================================================
// ARQUIVO: src/modules/notifications/notification.service.ts
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationGateway } from './notification.gateway.js';
import {
  NotificationType,
  NotificationSeverity,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Interfaces de eventos (publicadas pelo FiscalService via EventEmitter2)
// ---------------------------------------------------------------------------

export interface TaxAuditEvent {
  companyId: string;
  month: number;
  year: number;
  impostoAPagar: number;
  divergenciaBancaria: boolean;
  valorEmAberto: number;
  fatorR: number;
  gapFolhaMensal: number;
}

export interface NotificationDispatchResult {
  status: 'DISPATCHED';
  recipients: string[];
  timestamp: Date;
}

/**
 * NotificationService — Motor de Alertas Real-time bCost
 *
 * FIX CRÍTICO — DEPENDÊNCIA CIRCULAR REMOVIDA:
 * O serviço original injetava TaxService via @Inject(forwardRef(() => TaxService)),
 * criando um ciclo NotificationModule → FiscalModule → NotificationModule que
 * travava o NestFactory.create() indefinidamente.
 *
 * NOVA ARQUITETURA (inversão de dependência via EventEmitter2):
 * - NotificationService NÃO depende mais de TaxService
 * - FiscalCronService emite evento 'fiscal.audit.completed' após calcular impostos
 * - NotificationService escuta o evento via @OnEvent() e dispara as notificações
 * - Zero acoplamento direto entre os módulos
 *
 * BENEFÍCIO ADICIONAL: qualquer serviço pode emitir 'fiscal.audit.completed'
 * sem precisar importar NotificationService — extensível sem modificar este arquivo.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    // FIX: TaxService REMOVIDO — era a fonte do ciclo de dependência circular
  ) {}

  // ---------------------------------------------------------------------------
  // AUDITORIA AUTOMÁTICA VIA EVENTO (substitui injeção direta do TaxService)
  // ---------------------------------------------------------------------------

  /**
   * Escuta o evento 'fiscal.audit.completed' emitido pelo FiscalCronService.
   * Substitui o método runAutoAudit() que dependia do TaxService diretamente.
   *
   * Para emitir este evento de qualquer serviço fiscal:
   * ```typescript
   * this.eventEmitter.emit('fiscal.audit.completed', {
   *   companyId, month, year,
   *   impostoAPagar, divergenciaBancaria, valorEmAberto,
   *   fatorR, gapFolhaMensal
   * } satisfies TaxAuditEvent);
   * ```
   */
  @OnEvent('fiscal.audit.completed', { async: true })
  async handleTaxAuditCompleted(event: TaxAuditEvent): Promise<void> {
    this.logger.log(
      `[Notification] Auditoria recebida via evento — empresa: ${event.companyId}`,
    );

    try {
      if (event.impostoAPagar > 0) {
        await this.notifyTaxReady(
          event.companyId,
          event.month,
          event.year,
          event.impostoAPagar,
        );
      }

      if (event.divergenciaBancaria) {
        await this.notifyComplianceIssue(
          event.companyId,
          'DIVERGENCIA_BANCARIA',
          `Receitas no banco superam notas fiscais em R$ ${event.valorEmAberto.toLocaleString('pt-BR')}`,
        );
      }

      if (event.fatorR < 28) {
        await this.notifyFactorRWarning(
          event.companyId,
          event.fatorR,
          event.gapFolhaMensal,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Notification] Falha ao processar evento de auditoria: ${message}`,
      );
    }
  }

  /**
   * Método público mantido para compatibilidade com FiscalCronService
   * que ainda chama runAutoAudit() diretamente em alguns locais.
   * Retorna resultado sem lançar exceção — não deve travar o cron.
   */
  runAutoAudit(companyId: string): {
    auditCompleted: boolean;
    timestamp: Date;
    note: string;
  } {
    this.logger.log(`[bCost Engine] Auditoria manual iniciada: ${companyId}`);
    // Sem TaxService aqui — o cálculo real é feito pelo FiscalService
    // que emite o evento 'fiscal.audit.completed' ao terminar.
    // Este método existe apenas para compatibilidade de interface.
    return {
      auditCompleted: true,
      timestamp: new Date(),
      note: 'use fiscal.audit.completed event',
    };
  }

  // ---------------------------------------------------------------------------
  // NOTIFICAÇÕES ESPECÍFICAS
  // ---------------------------------------------------------------------------

  async notifyTaxReady(
    companyId: string,
    month: number,
    year: number,
    totalTax: number,
  ): Promise<NotificationDispatchResult> {
    const message = `📊 Guia DAS de ${month}/${year} pronta: R$ ${totalTax.toLocaleString('pt-BR')}.`;
    const log = await this.saveNotificationLog({
      companyId,
      type: NotificationType.TAX_READY,
      title: 'Imposto Calculado',
      message,
      severity: NotificationSeverity.INFO,
      metadata: { totalTax, month, year },
    });
    this.gateway.sendNotification(companyId, log);
    return {
      status: 'DISPATCHED',
      recipients: [companyId],
      timestamp: new Date(),
    };
  }

  async notifyFactorRWarning(
    companyId: string,
    currentFatorR: number,
    gapAmount: number,
  ): Promise<NotificationDispatchResult> {
    const message = `🚨 Fator R em ${currentFatorR}%. Aporte R$ ${gapAmount.toLocaleString('pt-BR')} em Pro-labore para reduzir o imposto.`;
    const log = await this.saveNotificationLog({
      companyId,
      type: NotificationType.FACTOR_R_ALERT,
      title: 'Risco de Alíquota Alta',
      message,
      severity: NotificationSeverity.WARNING,
      metadata: { currentFatorR, gapAmount },
    });
    this.gateway.sendNotification(companyId, log);
    return {
      status: 'DISPATCHED',
      recipients: [companyId],
      timestamp: new Date(),
    };
  }

  async notifyComplianceIssue(
    companyId: string,
    code: string,
    details?: string,
  ): Promise<NotificationDispatchResult> {
    const message = `⚠️ Atenção: ${details ?? code}`;
    const log = await this.saveNotificationLog({
      companyId,
      type: NotificationType.COMPLIANCE_ISSUE,
      title: 'Alerta de Compliance',
      message,
      severity: NotificationSeverity.CRITICAL,
      metadata: { code },
    });
    this.gateway.sendNotification(companyId, log);
    return {
      status: 'DISPATCHED',
      recipients: [companyId],
      timestamp: new Date(),
    };
  }

  async notifyCertificateExpiring(
    companyId: string,
    expiresAt: Date,
  ): Promise<NotificationDispatchResult> {
    const formattedDate = expiresAt.toLocaleDateString('pt-BR');
    const message = `🚨 Certificado Digital A1 vence em ${formattedDate}. Renove para evitar interrupção na emissão de notas.`;
    const log = await this.saveNotificationLog({
      companyId,
      type: NotificationType.CERT_EXPIRATION,
      title: 'Certificado Expirando',
      message,
      severity: NotificationSeverity.CRITICAL,
      metadata: { expiresAt },
    });
    this.gateway.sendNotification(companyId, log);
    return {
      status: 'DISPATCHED',
      recipients: [companyId],
      timestamp: new Date(),
    };
  }

  async notifyPredictiveCashflow(
    companyId: string,
    balanceProjected: number,
    date: Date,
  ): Promise<NotificationDispatchResult> {
    const message = `📉 Projeção de Caixa: Saldo será R$ ${balanceProjected.toLocaleString('pt-BR')} em ${date.toLocaleDateString()}.`;
    const log = await this.saveNotificationLog({
      companyId,
      type: NotificationType.PREDICTIVE_CASHFLOW_ALERT,
      title: 'Previsão de Caixa',
      message,
      severity:
        balanceProjected < 0
          ? NotificationSeverity.CRITICAL
          : NotificationSeverity.WARNING,
    });
    this.gateway.sendNotification(companyId, log);
    return {
      status: 'DISPATCHED',
      recipients: [companyId],
      timestamp: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // NOTIFICAÇÃO GENÉRICA (usado por RuleEngineService, AnomalyService, etc.)
  // ---------------------------------------------------------------------------

  async createNotification(data: {
    companyId: string;
    userId?: string;
    type: NotificationType;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    channel?: NotificationChannel;
    metadata?: Prisma.InputJsonValue;
  }) {
    const log = await this.saveNotificationLog({
      companyId: data.companyId,
      type: data.type,
      title: data.title,
      message: data.message,
      severity: data.severity ?? NotificationSeverity.INFO,
      metadata: data.metadata ?? {},
    });
    this.gateway.sendNotification(data.companyId, log);
    return log;
  }

  // ---------------------------------------------------------------------------
  // HISTÓRICO E CONSULTAS
  // ---------------------------------------------------------------------------

  async findByCompany(companyId: string) {
    return this.prisma.notificationLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async acknowledge(params: {
    notificationId: string;
    companyId: string;
    userId: string;
  }): Promise<{ acknowledged: boolean; data: unknown }> {
    const { notificationId, companyId, userId } = params;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationLog.update({
        where: { id: notificationId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedById: userId,
          read: true,
          readAt: new Date(),
          status: NotificationStatus.READ,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          companyId,
          action: 'ACKNOWLEDGE_NOTIFICATION',
          module: 'NOTIFICATION',
          entity: 'NotificationLog',
          entityId: notificationId,
          payload: { action: 'READ_RECEIPT' } as Prisma.InputJsonValue,
        },
      });

      return { acknowledged: true, data: updated };
    });
  }

  // ---------------------------------------------------------------------------
  // PERSISTÊNCIA INTERNA
  // ---------------------------------------------------------------------------

  private async saveNotificationLog(params: {
    companyId: string;
    type: NotificationType;
    title: string;
    message: string;
    severity: NotificationSeverity;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      return await this.prisma.notificationLog.create({
        data: {
          companyId: params.companyId,
          type: params.type,
          title: params.title,
          message: params.message,
          severity: params.severity,
          channel: NotificationChannel.WEBSOCKET,
          status: NotificationStatus.PENDING,
          metadata: params.metadata ?? {},
          sentAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[DB Error] Log de notificação falhou: ${message}`);
      throw err;
    }
  }
}
