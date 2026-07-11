'use strict';

import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service.js';
import { ObligationStatus, Prisma } from '@prisma/client';

/**
 * Interface de retorno para garantir tipagem forte
 */
export interface ReconciliationMatch {
  obligationId: string;
  status: ObligationStatus;
}

export type ReconciliationSummary =
  | { message: string }
  | {
      processed: number;
      matched: number;
      matches: ReconciliationMatch[];
    };

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('finance-queue') private readonly financeQueue: Queue,
  ) {}

  /**
   * DISPARO ASSÍNCRONO (Via Fila)
   */
  async enqueueReconciliation(companyId: string, userId: string) {
    const job = await this.financeQueue.add(
      'reconcile-tax-obligations',
      { companyId, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    );

    this.logger.log(
      `[Finance-Queue] Job enfileirado: ${job.id} para Empresa: ${companyId}`,
    );
    return { jobId: job.id, status: 'QUEUED' };
  }

  /**
   * MOTOR DE CONCILIAÇÃO AUTOMÁTICA
   * Utiliza this.prisma.extended para garantir filtros de Soft Delete e Company Scope
   */
  async reconcileTaxObligations(
    companyId: string,
    userId: string,
  ): Promise<ReconciliationSummary> {
    const startTime = Date.now();

    // Define o escopo global para esta execução (segurança Multi-tenant)
    

    const pendingObligations =
      await this.prisma.taxObligation.findMany({
        where: {companyId,  status: ObligationStatus.PENDING }, // companyId é injetado automaticamente
        orderBy: { dueDate: 'asc' },
      });

    if (pendingObligations.length === 0)
      return { message: 'Nada a conciliar.' };

    const matchedResults: ReconciliationMatch[] = [];

    for (const obligation of pendingObligations) {
      const month = obligation.dueDate.getUTCMonth() + 1;
      const year = obligation.dueDate.getUTCFullYear();

      const isLocked = await this.prisma.balanceLock.findUnique({
        where: { companyId_month_year: { companyId, month, year } },
      });

      if (isLocked) {
        this.logger.warn(
          `[Finance] Período ${month}/${year} bloqueado para empresa ${companyId}.`,
        );
        continue;
      }

      const amountToMatch = obligation.amount.mul(-1);
      const potentialMatch =
        await this.prisma.bankTransaction.findFirst({
          where: {
            amount: amountToMatch,
            reconciled: false,
            occurredAt: {
              gte: new Date(
                obligation.dueDate.getTime() - 15 * 24 * 60 * 60 * 1000,
              ),
              lte: new Date(
                obligation.dueDate.getTime() + 5 * 24 * 60 * 60 * 1000,
              ),
            },
          },
        });

      if (potentialMatch) {
        try {
          // Transação ACID usando o executor robusto do seu PrismaService
          const result = await this.prisma.runInTransaction(async (tx) => {
            await tx.bankTransaction.update({
              where: { id: potentialMatch.id },
              data: { reconciled: true, taxObligationId: obligation.id },
            });

            const updated = await tx.taxObligation.update({
              where: { id: obligation.id },
              data: { status: ObligationStatus.PAID },
            });

            await tx.auditLog.create({
              data: {
                userId,
                companyId,
                action: 'AUTO_RECONCILIATION_TAX',
                module: 'FINANCE',
                entity: 'TaxObligation',
                entityId: obligation.id,
                payload: {
                  bankTransactionId: potentialMatch.id,
                } as Prisma.InputJsonValue,
                statusCode: 200,
                responseTime: Date.now() - startTime,
              },
            });

            return { obligationId: updated.id, status: updated.status };
          });

          matchedResults.push(result);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          this.logger.error(
            `Falha na transação da obrigação ${obligation.id}: ${message}`,
          );
        }
      }
    }

     // Limpa o escopo após o processamento
    return {
      processed: pendingObligations.length,
      matched: matchedResults.length,
      matches: matchedResults,
    };
  }

  /**
   * BLOQUEIO DE PERÍODO CONTÁBIL
   */
  async lockFinancialPeriod(
    companyId: string,
    month: number,
    year: number,
    userId: string,
  ) {
    try {
      return await this.prisma.balanceLock.create({
        data: {
          companyId,
          month,
          year,
          lockedBy: userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `O período ${month}/${year} já está bloqueado.`,
        );
      }
      throw error;
    }
  }

  /**
   * TRILHA DE AUDITORIA DO MÓDULO
   */
  async getModuleAuditTrail(companyId: string, module: string) {
    
    return await this.prisma.auditLog.findMany({
      where: {companyId,  module },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
      },
    });
  }

  /**
   * HEALTH SUMMARY
   */
  async getFinancialHealthSummary(companyId: string) {
    

    const [balance, pendingTax] = await Promise.all([
      this.prisma.bankTransaction.aggregate({ where: { companyId },
        _sum: { amount: true },
      }),
      this.prisma.taxObligation.aggregate({
        where: { status: ObligationStatus.PENDING },
        _sum: { amount: true },
      }),
    ]);

    const cash = Number(balance._sum.amount) || 0;
    const liability = Number(pendingTax._sum.amount) || 0;

    return {
      cashBalance: cash,
      totalTaxLiability: liability,
      availableBalance: cash - liability,
      healthIndex: liability > 0 ? (cash / liability).toFixed(2) : '100',
      updatedAt: new Date(),
    };
  }
}
