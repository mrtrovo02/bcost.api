'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { JobStatus, Prisma } from '@prisma/client';

/**
 * AutomationJobService: Motor de execução assíncrona do bCost.
 * Gerencia o ciclo de vida de tarefas pesadas e auditorias em lote,
 * permitindo o monitoramento em tempo real via Dashboard.
 */
@Injectable()
export class AutomationJobService {
  private readonly logger = new Logger(AutomationJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Dispara a auditoria fiscal para todas as empresas ativas.
   * Agrupa as execuções sob um 'jobGroup' para métricas agregadas.
   */
  async triggerMonthlyGlobalAudit() {
    this.logger.log(
      '🛡️ [Automation] Iniciando varredura global de auditoria fiscal.',
    );

    const activeCompanies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    if (activeCompanies.length === 0) {
      return {
        totalTriggered: 0,
        status: 'IDLE',
        message: 'Nenhuma empresa ativa para processar.',
      };
    }

    const jobGroup = `GLOBAL_AUDIT_${new Date().toISOString().slice(0, 7)}`;

    // Execução em background: Itera sobre as empresas e dispara o processo individual
    activeCompanies.forEach((company) => {
      this.createAndExecuteJob(company.id, company.name, jobGroup).catch(
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[Fatal] Erro não tratado no Job da empresa ${company.name}: ${message}`,
          );
        },
      );
    });

    return {
      totalTriggered: activeCompanies.length,
      group: jobGroup,
      status: 'PROCESSING_STARTED',
      timestamp: new Date(),
    };
  }

  /**
   * CORE: Cria o registro e executa a lógica de auditoria via NotificationService.
   * Utiliza transações implícitas ao gerenciar o estado do AutomationJob.
   */
  private async createAndExecuteJob(
    companyId: string,
    companyName: string,
    group: string,
  ) {
    let jobId: string | null = null;

    try {
      // 1. Registro inicial: Status RUNNING conforme o Enum do Schema
      const job = await this.prisma.automationJob.create({
        data: {
          name: `Auditoria: ${companyName} [${group}]`,
          status: JobStatus.RUNNING,
          payload: { group, companyId } as Prisma.InputJsonValue,
          startedAt: new Date(),
          company: { connect: { id: companyId } },
        },
      });

      jobId = job.id;
      this.logger.log(`[Job ${jobId}] Iniciado para: ${companyName}`);

      // 2. Execução do motor de auditoria (Pode levar tempo dependendo das APIs externas)
      const auditResult = this.notificationService.runAutoAudit(companyId);

      // 3. Finalização com Sucesso
      await this.prisma.automationJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          progress: 100, // Campo progress do schema
          result: auditResult as Prisma.InputJsonValue,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ [Job Error] Falha na empresa ${companyName}: ${message}`,
      );

      // 4. Tratamento de Falha Resiliente
      if (jobId) {
        await this.prisma.automationJob.update({
          where: { id: jobId },
          data: {
            status: JobStatus.FAILED,
            completedAt: new Date(),
            result: {
              error: message,
              phase: 'EXECUTION',
              timestamp: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  /**
   * MÉTODO DE MÉTRICAS:
   * Extrai estatísticas por status para alimentar os gráficos do bCost.
   */
  async getJobMetrics(group?: string) {
    this.logger.log(
      `📊 [Metrics] Agregando resultados para o grupo: ${group || 'TODOS'}`,
    );

    const where: Prisma.AutomationJobWhereInput = group
      ? { payload: { path: ['group'], equals: group } }
      : {};

    const stats = await this.prisma.automationJob.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    // Converte o array do Prisma para um objeto literal: { RUNNING: 5, COMPLETED: 10... }
    const initialStats: Record<string, number> = {
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    return stats.reduce((acc, curr) => {
      acc[curr.status] = curr._count.id;
      return acc;
    }, initialStats);
  }

  /**
   * Limpeza de histórico (Manutenção de performance do PostgreSQL)
   */
  async clearOldJobs(days: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const deleted = await this.prisma.automationJob.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        status: { in: [JobStatus.COMPLETED, JobStatus.FAILED] },
      },
    });

    this.logger.log(
      `🧹 [Cleanup] Removidos ${deleted.count} logs de automação antigos.`,
    );
    return deleted;
  }
}
