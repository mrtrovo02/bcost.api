'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthService, DbPerformanceMetric } from '../health.service.js';
import { NotificationGateway } from '../../notifications/notification.gateway.js';
import { ExternalNotifierService } from '../../notifications/external-notifier.service.js';

/**
 * PerformanceAuditService
 * Age como o "Watchdog" da bCost Engine.
 * Executa auditorias programadas para prevenir degradação de performance.
 */
@Injectable()
export class PerformanceAuditService {
  private readonly logger = new Logger(PerformanceAuditService.name);

  // Configuração de threshold para tabelas críticas
  private readonly CRITICAL_TABLES = ['bank_transactions', 'users', 'invoices'];
  private readonly MIN_EFFICIENCY = 80;

  constructor(
    private readonly healthService: HealthService,
    private readonly notificationGateway: NotificationGateway,
    private readonly externalNotifier: ExternalNotifierService, // Adicionado para notificações externas
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleIndexAudit() {
    this.logger.log('🕵️ Iniciando auditoria de performance de índices...');

    try {
      const { metrics } = await this.healthService.getDatabaseMetrics();

      if (metrics.length === 0) {
        this.logger.warn('⚠️ Auditoria pulada: métricas de banco indisponíveis no momento.');
        return;
      }

      const bottlenecks = metrics.filter(
        (m: DbPerformanceMetric) =>
          (this.CRITICAL_TABLES.includes(m.tabela) || m.total_linhas > 1000) &&
          Number(m.eficiencia_indice_percentual) < this.MIN_EFFICIENCY &&
          m.total_linhas > 100,
      );

      if (bottlenecks.length > 0) {
        await this.triggerAlerts(bottlenecks);
      } else {
        this.logger.log(
          '✅ Todos os índices críticos operando com eficiência acima de 80%.',
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.warn(`⚠️ Auditoria de performance ignorada: ${message}`);
    }
  }

  private async triggerAlerts(bottlenecks: DbPerformanceMetric[]) {
    const tableNames = bottlenecks.map((b) => b.tabela).join(', ');
    this.logger.warn(`🚨 Gargalos detectados: ${tableNames}`);

    // 1. Notificação Real-time (WebSocket) para usuários logados no Dashboard
    this.notificationGateway.sendNotification('ADMIN_ROOM', {
      type: 'PERFORMANCE_CRITICAL',
      title: 'Gargalo de Banco Detectado',
      message: `Tabelas perdendo eficiência: [${tableNames}]`,
      payload: bottlenecks,
    });

    // 2. Notificação Externa (Webhook) para alerta fora de hora (Discord/Slack)
    const report = bottlenecks
      .map(
        (b) =>
          `- **${b.tabela}**: ${b.eficiencia_indice_percentual}% (Linhas: ${b.total_linhas})`,
      )
      .join('\n');

    await this.externalNotifier.sendDiscordAlert(
      'Degradação de Performance',
      `Alerta disparado pela bCost Engine:\n${report}`,
    );
  }
}
