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
import type { BankTransaction } from '@prisma/client';

import { ReconciliationScoreEngine } from './scoring/reconciliation.score.js';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto.js';
import { NotificationGateway } from '../notifications/notification.gateway.js';

export interface ManualMatchOptions {
  invoiceId?: string;
  taxObligationId?: string;
  companyId?: string;
  force?: boolean;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async manualMatch(
    bankTransactionId: string,
    options: ManualMatchOptions,
    userId: string,
  ) {
    const { invoiceId, taxObligationId, companyId, force } = options;

    return this.prisma.$transaction(
      async (tx) => {
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

        if (invoiceId) {
          const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
          if (!inv) throw new NotFoundException('Nota fiscal não encontrada.');
          await tx.invoice.update({
            where: { id: invoiceId },
            data: { reconciled: true },
          });
        }

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

        const updatedTransaction = await tx.bankTransaction.update({
          where: { id: bankTransactionId },
          data: {
            reconciled: true,
            invoiceId: invoiceId || null,
            taxObligationId: taxObligationId || null,
          },
        });

        if (userId !== this.SYSTEM_USER_ID) {
          this.notificationGateway.sendDashboardUpdate(trn.companyId, {
            type: 'MANUAL_RECONCILIATION_SUCCESS',
            transactionId: bankTransactionId,
          });
        }

        return updatedTransaction;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async runAutoMatch(companyId: string) {
    this.logger.log(
      `[Auto-Match] Iniciando processamento para Company=${companyId}`,
    );

    const BATCH_SIZE = 500;
    let reconciledCount = 0;
    let totalProcessed = 0;
    let lastId: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const transactions = await this.prisma.bankTransaction.findMany({
        take: BATCH_SIZE,
        skip: lastId ? 1 : 0,
        cursor: lastId ? { id: lastId } : undefined,
        where: { companyId, reconciled: false },
        orderBy: { occurredAt: 'asc' },
      });

      if (transactions.length === 0) {
        hasMore = false;
        break;
      }

      lastId = transactions[transactions.length - 1].id;
      totalProcessed += transactions.length;

      const minDate = new Date(
        Math.min(...transactions.map((t) => t.occurredAt.getTime())) -
          7 * 86400000,
      );
      const maxDate = new Date(
        Math.max(...transactions.map((t) => t.occurredAt.getTime())) +
          3 * 86400000,
      );

      const candidateInvoices = await this.prisma.invoice.findMany({
        where: {
          companyId,
          reconciled: false,
          status: InvoiceStatus.NORMAL,
          issuedAt: { gte: minDate, lte: maxDate },
        },
        include: { customer: true },
      });

      for (const trn of transactions) {
        const possibleMatches = candidateInvoices.filter(
          (inv) =>
            inv.issuedAt.getTime() >= trn.occurredAt.getTime() - 7 * 86400000 &&
            inv.issuedAt.getTime() <= trn.occurredAt.getTime() + 3 * 86400000,
        );

        let bestScore = 0;
        let candidateId: string | null = null;

        for (const inv of possibleMatches) {
          const score = ReconciliationScoreEngine.calculate({
            transaction: {
              amount: trn.amount,
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
          } catch (err) {
            this.logger.error(
              `[Auto-Match Error] Tx=${trn.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }

    const result = {
      totalProcessed,
      autoReconciled: reconciledCount,
      accuracy:
        totalProcessed > 0
          ? Number(((reconciledCount / totalProcessed) * 100).toFixed(2))
          : 0,
    };

    this.notificationGateway.sendReconciliationFinished(companyId, result);
    this.notificationGateway.sendDashboardUpdate(companyId, { refresh: true });

    return result;
  }

  async queryMatches(query: ReconciliationQueryDto) {
    return this.prisma.bankTransaction.findMany({
      where: {
        companyId: query.companyId,
        reconciled: query.reconciled,
        occurredAt: { gte: query.startDate, lte: query.endDate },
      },
      include: {
        bankAccount: true,
        invoice: { include: { customer: true } },
        taxObligation: true,
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async undoMatch(transactionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const trn = await tx.bankTransaction.findUnique({
        where: { id: transactionId },
      });
      if (!trn) throw new NotFoundException('Transação não encontrada.');
      if (!trn.reconciled)
        throw new BadRequestException('Esta transação não está conciliada.');

      if (trn.invoiceId)
        await tx.invoice.update({
          where: { id: trn.invoiceId },
          data: { reconciled: false },
        });
      if (trn.taxObligationId)
        await tx.taxObligation.update({
          where: { id: trn.taxObligationId },
          data: { status: ObligationStatus.PENDING },
        });

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
        data: { reconciled: false, invoiceId: null, taxObligationId: null },
      });

      this.notificationGateway.sendDashboardUpdate(trn.companyId, {
        refresh: true,
      });
      return updated;
    });
  }

  @OnEvent('banking.transaction.imported')
  async handleNewTransactionEvent(transaction: BankTransaction) {
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
