'use strict';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FinanceService } from '../finance.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
// 💡 CORREÇÃO: Usando caminho relativo para garantir que o símbolo da classe seja idêntico ao exportado
import { NotificationGateway } from '../../notifications/notification.gateway.js';
import {
  NotificationType,
  NotificationSeverity,
  NotificationStatus,
  NotificationChannel,
} from '@prisma/client';

type FinanceJobData = { companyId: string; userId: string };

@Processor('finance-queue')
export class FinanceProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceProcessor.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly prisma: PrismaService,

    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<FinanceJobData, unknown, string>): Promise<unknown> {
    const { companyId, userId } = job.data;

    switch (job.name) {
      case 'reconcile-tax-obligations':
        return await this.handleReconciliation(job, companyId, userId);
      default:
        this.logger.warn(`[Queue] Job desconhecido solicitado: ${job.name}`);
    }
  }

  private async handleReconciliation(
    job: Job<FinanceJobData, unknown, string>,
    companyId: string,
    userId: string,
  ) {
    const startTimestamp = Date.now();
    this.logger.log(
      `[Queue] Iniciando conciliação | JobID: ${job.id} | Empresa: ${companyId}`,
    );

    try {
      this.prisma.extended.$transaction(async (tx) => tx);

      const result = await this.financeService.reconcileTaxObligations(
        companyId,
        userId,
      );
      const processed = 'processed' in result ? result.processed : 0;
      const matched = 'matched' in result ? result.matched : 0;
      const matches = 'matches' in result ? result.matches : [];
      const message =
        'message' in result
          ? result.message
          : `Processados ${processed} itens | ${matched} correspondências.`;

      // 3. Persistência no Banco usando o cliente estendido (v7)
      const notification = await this.prisma.extended.notificationLog.create({
        data: {
          companyId,
          userId,
          type: NotificationType.TAX_READY,
          severity: NotificationSeverity.INFO,
          title: 'Conciliação Finalizada',
          message,
          status: NotificationStatus.SENT,
          channel: NotificationChannel.WEBSOCKET,
          metadata: {
            jobId: job.id,
            matched,
            duration: `${Date.now() - startTimestamp}ms`,
          },
        },
      });

      // 4. DISPARO REAL-TIME
      this.notificationGateway.sendReconciliationFinished(companyId, {
        autoReconciled: matched,
        totalProcessed: processed,
        notificationId: notification.id,
        matches,
      });

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Queue] Erro crítico no Job ${job.id}: ${message}`);

      // Notifica erro via socket para evitar que o usuário fique em "loop" de espera
      if (this.notificationGateway) {
        this.notificationGateway.sendNotification(companyId, {
          type: 'ERROR',
          message: 'Falha na conciliação automática.',
        });
      }

      throw error;
    }
  }
}
