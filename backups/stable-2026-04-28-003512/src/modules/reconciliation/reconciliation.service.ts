'use strict';

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service.js';
import { InvoiceStatus, ObligationStatus, Prisma } from '@prisma/client';

// 🚀 CORREÇÃO TS1272: Importação de tipo explícita para compatibilidade com emitDecoratorMetadata
import type { BankTransaction } from '@prisma/client';

import { ReconciliationScoreEngine } from './scoring/reconciliation.score.js';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto.js';
import { NotificationGateway } from '../notifications/notification.gateway.js';

/**
 * Interface oficial para opções de conciliação manual.
 * Define o contrato técnico entre o Controller e o Service.
 */
export interface ManualMatchOptions {
  invoiceId?: string;
  taxObligationId?: string;
  companyId?: string;
  force?: boolean;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  // ID fixo para processos onde não há um usuário humano (Auto-Match)
  private readonly SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway, // 📡 Injeção para Real-time
  ) {}

  /**
   * manualMatch: Realiza o vínculo 1:1 entre transação e documento com Auditoria.
   */
  async manualMatch(
    bankTransactionId: string,
    options: ManualMatchOptions,
    userId: string,
  ) {
    const { invoiceId, taxObligationId, companyId, force } = options;

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Validar existência e integridade da transação
        const trn = await tx.bankTransaction.findUnique({
          where: { id: bankTransactionId },
        });

        if (!trn)
          throw new NotFoundException('Transação bancária não encontrada.');

        if (companyId && trn.companyId !== companyId) {
          throw new BadRequestException(
            'A transação não pertence a esta empresa.',
          );
        }

        if (trn.reconciled && !force) {
          throw new ConflictException(
            'Esta transação já possui um vínculo ativo.',
          );
        }

        // 2. Processar Invoice (Nota Fiscal)
        if (invoiceId) {
          const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
          if (!inv) throw new NotFoundException('Nota fiscal não encontrada.');

          await tx.invoice.update({
            where: { id: invoiceId },
            data: { reconciled: true },
          });
        }

        // 3. Processar Imposto (TaxObligation)
        if (taxObligationId) {
          const tax = await tx.taxObligation.findUnique({
            where: { id: taxObligationId },
          });
          if (!tax)
            throw new NotFoundException('Obrigação fiscal não encontrada.');

          await tx.taxObligation.update({
            where: { id: taxObligationId },
            data: { status: ObligationStatus.PAID },
          });
        }

        // 4. Registrar Auditoria
        await tx.auditLog.create({
          data: {
            userId,
            companyId: trn.companyId,
            action: 'MANUAL_MATCH',
            module: 'RECONCILIATION',
            entity: 'BankTransaction',
            entityId: bankTransactionId,
            payload: { ...options } as Prisma.InputJsonValue,
            statusCode: 200,
          },
        });

        this.logger.log(
          `[Conciliação] Tx ${bankTransactionId} vinculada por User ${userId}.`,
        );

        const updatedTransaction = await tx.bankTransaction.update({
          where: { id: bankTransactionId },
          data: {
            reconciled: true,
            invoiceId: invoiceId || null,
            taxObligationId: taxObligationId || null,
          },
        });

        // Se for uma ação manual de usuário, envia atualização imediata ao Dashboard
        if (userId !== this.SYSTEM_USER_ID) {
          this.notificationGateway.sendDashboardUpdate(trn.companyId, {
            type: 'MANUAL_RECONCILIATION_SUCCESS',
            transactionId: bankTransactionId,
          });
        }

        return updatedTransaction;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }

  /**
   * runAutoMatch: Busca pares probabilísticos usando o Scoring Engine e notifica via WS.
   */
  async runAutoMatch(companyId: string) {
    this.logger.log(`[Auto-Match] Iniciado para Company=${companyId}`);

    const transactions = await this.prisma.bankTransaction.findMany({
      where: { companyId, reconciled: false },
    });

    let reconciledCount = 0;

    for (const trn of transactions) {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          companyId,
          reconciled: false,
          status: InvoiceStatus.NORMAL,
          issuedAt: {
            gte: new Date(trn.occurredAt.getTime() - 7 * 86400000), // -7 dias
            lte: new Date(trn.occurredAt.getTime() + 3 * 86400000), // +3 dias
          },
        },
        include: { customer: true },
      });

      let bestScore = 0;
      let candidateId: string | null = null;

      for (const inv of invoices) {
        const score = ReconciliationScoreEngine.calculate({
          transaction: {
            amount: trn.amount, // Decimal-safe via Engine
            date: trn.occurredAt,
            description: trn.description,
          },
          invoice: {
            totalValue: inv.amount,
            issueDate: inv.issuedAt,
            hasCustomer: !!inv.customerId,
            customerName: inv.customer?.name,
          },
        });

        if (score > bestScore && score >= 85) {
          bestScore = score;
          candidateId = inv.id;
        }
      }

      if (candidateId) {
        try {
          await this.manualMatch(
            trn.id,
            { invoiceId: candidateId, companyId },
            this.SYSTEM_USER_ID,
          );
          reconciledCount++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`[Auto-Match Error] Tx=${trn.id}: ${message}`);
        }
      }
    }

    const result = {
      totalProcessed: transactions.length,
      autoReconciled: reconciledCount,
      accuracy:
        transactions.length > 0
          ? Number(((reconciledCount / transactions.length) * 100).toFixed(2))
          : 0,
    };

    // 🚀 NOTIFICAÇÃO REAL-TIME: Avisa o front-end que a mágica aconteceu
    this.notificationGateway.sendReconciliationFinished(companyId, result);
    this.notificationGateway.sendDashboardUpdate(companyId, { refresh: true });

    return result;
  }

  /**
   * queryMatches: Abastece a listagem de conciliação.
   */
  async queryMatches(query: ReconciliationQueryDto) {
    return this.prisma.bankTransaction.findMany({
      where: {
        companyId: query.companyId,
        reconciled: query.reconciled,
        occurredAt: {
          gte: query.startDate,
          lte: query.endDate,
        },
      },
      include: {
        bankAccount: true,
        invoice: {
          include: { customer: true },
        },
        taxObligation: true,
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  /**
   * undoMatch: Reverte a conciliação e libera os documentos.
   */
  async undoMatch(transactionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trn = await tx.bankTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!trn) throw new NotFoundException('Transação não encontrada.');
      if (!trn.reconciled)
        throw new BadRequestException('Esta transação não está conciliada.');

      if (trn.invoiceId) {
        await tx.invoice.update({
          where: { id: trn.invoiceId },
          data: { reconciled: false },
        });
      }

      if (trn.taxObligationId) {
        await tx.taxObligation.update({
          where: { id: trn.taxObligationId },
          data: { status: ObligationStatus.PENDING },
        });
      }

      await tx.auditLog.create({
        data: {
          userId,
          companyId: trn.companyId,
          action: 'UNDO_MATCH',
          module: 'RECONCILIATION',
          entity: 'BankTransaction',
          entityId: transactionId,
          statusCode: 200,
        },
      });

      const updated = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: {
          reconciled: false,
          invoiceId: null,
          taxObligationId: null,
        },
      });

      this.notificationGateway.sendDashboardUpdate(trn.companyId, {
        refresh: true,
      });

      return updated;
    });
  }

  @OnEvent('banking.transaction.imported')
  async handleNewTransactionEvent(transaction: BankTransaction) {
    this.logger.log(
      `[Event] Nova transação detectada para Company ${transaction.companyId}. Executando Auto-Match...`,
    );
    return this.runAutoMatch(transaction.companyId);
  }

  async getSummary(companyId: string) {
    const summary = await this.prisma.bankTransaction.groupBy({
      by: ['reconciled'],
      where: { companyId },
      _sum: { amount: true },
      _count: { id: true },
    });

    return summary.map((item) => ({
      status: item.reconciled ? 'CONCILIADO' : 'PENDENTE',
      count: item._count.id,
      total: item._sum.amount,
    }));
  }
}
