'use strict';

// =============================================================================
// ARQUIVO: src/modules/notifications/services/alert.service.ts
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  NotificationType,
  NotificationSeverity,
  NotificationStatus,
  NotificationChannel,
  Prisma,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Payload de entrada para alertas de anomalia financeira.
 * Usado pelo AnomalyDetectionService e FactorREngineService.
 */
export interface IAnomalyAlert {
  companyId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  metadata?: Prisma.InputJsonValue;
}

export interface CriticalAnomalyAlertEvent {
  companyId: string;
  severity: 'HIGH';
  title: string;
  message: string;
  notificationId: string;
  metadata: Prisma.InputJsonValue;
  occurredAt: string;
}

/**
 * Mapeamento de severidade do alerta interno para o enum do schema.
 * LOW  → INFO
 * MEDIUM → WARNING
 * HIGH → CRITICAL
 */
const SEVERITY_MAP: Record<IAnomalyAlert['severity'], NotificationSeverity> = {
  LOW: NotificationSeverity.INFO,
  MEDIUM: NotificationSeverity.WARNING,
  HIGH: NotificationSeverity.CRITICAL,
};

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Dispara um alerta de conformidade ou anomalia financeira.
   *
   * Mandamento bCost: Todo alerta deve ser persistido para fins de compliance.
   * Erros de persistência são logados mas não propagados — este serviço é chamado
   * de dentro de cálculos fiscais e não deve interromper o fluxo principal.
   *
   * FIX: campos corrigidos para o schema real do NotificationLog:
   * - `content`  → `message`   (campo correto no schema)
   * - `isRead`   → `read`      (campo correto no schema)
   * - `type: 'FISCAL_ANOMALY'` → `NotificationType.COMPLIANCE_ISSUE`
   *   ('FISCAL_ANOMALY' não existe no enum NotificationType do schema)
   */
  async triggerAnomalyAlert(alert: IAnomalyAlert) {
    this.logger.warn(
      `📢 Disparando alerta [${alert.severity}] para empresa ${alert.companyId}: ${alert.message}`,
    );

    try {
      // Persistência no banco via prisma.extended para isolamento automático por companyId
      const notification = await this.prisma.extended.notificationLog.create({
        data: {
          companyId: alert.companyId,
          // FIX: 'FISCAL_ANOMALY' não existe — COMPLIANCE_ISSUE é o tipo correto
          // para anomalias detectadas no motor fiscal
          type: NotificationType.COMPLIANCE_ISSUE,
          title: `Anomalia Detectada: Nível ${alert.severity}`,
          // FIX: 'content' → 'message' (nome correto no schema)
          message: alert.message,
          severity: SEVERITY_MAP[alert.severity],
          channel: NotificationChannel.WEBSOCKET,
          // FIX: 'isRead' → 'read' (nome correto no schema)
          read: false,
          status: NotificationStatus.PENDING,
          metadata: alert.metadata ?? {},
        },
      });

      // Escalada para push crítico em caso de severidade HIGH
      if (alert.severity === 'HIGH') {
        this.dispatchCriticalPush(alert, notification.id);
      }

      return notification;
    } catch (error: unknown) {
      // FIX: error: any → error: unknown com narrowing
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Falha ao registrar alerta para empresa ${alert.companyId}: ${message}`,
      );
      // Não relança — chamado de dentro de cálculos fiscais críticos
    }
  }

  /**
   * Escalada crítica para canais de alta prioridade.
   * Publica evento interno para consumidores WebSocket, workers e integrações externas.
   */
  private dispatchCriticalPush(
    alert: IAnomalyAlert,
    notificationId: string,
  ): void {
    this.logger.log(
      `[PUSH CRITICAL] Escalada de alerta HIGH para administradores — empresa ${alert.companyId}`,
    );

    const event: CriticalAnomalyAlertEvent = {
      companyId: alert.companyId,
      severity: 'HIGH',
      title: 'Anomalia crítica detectada',
      message: alert.message,
      notificationId,
      metadata: alert.metadata ?? {},
      occurredAt: new Date().toISOString(),
    };

    this.eventEmitter.emit('notification.critical-anomaly', event);
  }
}
