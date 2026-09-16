'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationService } from '../notifications/notification.service.js';

@Injectable()
export class FiscalCronService {
  private readonly logger = new Logger(FiscalCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Agendador Automático: Executa a Auditoria Proativa para todas as empresas.
   * Padrão: Todo dia às 03:00 da manhã.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyAudit() {
    this.logger.log(
      '[Cron Engine] Iniciando rotina global de Auditoria Proativa...',
    );

    // 1. Busca apenas empresas ativas para otimizar processamento
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    this.logger.log(
      `[Cron Engine] ${companies.length} empresas encontradas para processamento.`,
    );

    // 2. Executa a auditoria em paralelo com controle de erro individual
    for (const company of companies) {
      try {
        this.logger.debug(`[Cron Engine] Processando: ${company.name}`);
        this.notificationService.runAutoAudit(company.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[Cron Engine] Falha na auditoria da empresa ${company.name}: ${message}`,
        );
      }
    }

    this.logger.log('[Cron Engine] Rotina de Auditoria Proativa finalizada.');
  }
}
