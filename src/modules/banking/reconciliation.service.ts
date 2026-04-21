'use strict';

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { TransactionType, InvoiceStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  /**
   * ID de Sistema para Auditoria Automatizada.
   * Certifique-se de que este UUID exista na tabela 'users' (via Seed).
   */
  private readonly SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🚀 AUTO MATCH (CONCILIAÇÃO AUTOMÁTICA)
   * Utiliza o Prisma Extended para ignorar registros com 'deletedAt'.
   */
  async runAutoMatch(companyId: string) {
    if (!companyId) {
      throw new BadRequestException('companyId é obrigatório.');
    }

    this.logger.log(
      `[Reconciliation] Auto-Match iniciado | Company=${companyId}`,
    );

    // Uso do .extended para garantir Soft Delete Compliance
    const pendingTransactions =
      await this.prisma.extended.bankTransaction.findMany({
        where: {
          companyId,
          reconciled: false,
          type: TransactionType.CREDIT,
        },
        orderBy: { occurredAt: 'asc' },
      });

    let matchCount = 0;

    for (const trn of pendingTransactions) {
      const match = await this.findInvoiceMatch(companyId, trn);

      if (!match) continue;

      try {
        // Transação atômica com isolamento de leitura para evitar Double-Spending
        await this.prisma.$transaction(
          async (tx) => {
            await tx.bankTransaction.update({
              where: { id: trn.id },
              data: {
                reconciled: true,
                invoiceId: match.id,
              },
            });

            await tx.invoice.update({
              where: { id: match.id },
              data: {
                reconciled: true,
                status: InvoiceStatus.PAID, // Atualiza status para fluxo de PnL
              },
            });

            // Registro de Auditoria Enterprise
            await tx.auditLog.create({
              data: {
                userId: this.SYSTEM_USER_ID,
                companyId,
                action: 'AUTO_RECONCILIATION_MATCH',
                module: 'RECONCILIATION',
                entity: 'BankTransaction',
                entityId: trn.id,
                payload: { invoiceId: match.id, amount: trn.amount },
                statusCode: 200,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          },
        );

        matchCount++;
        this.logger.debug(
          `[MATCH OK] BankTransaction=${trn.id} Invoice=${match.id}`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`[MATCH ERROR] Transaction=${trn.id}`, message);
      }
    }

    const analyzed = pendingTransactions.length;
    return {
      analyzed,
      reconciled: matchCount,
      accuracy:
        analyzed > 0 ? Number(((matchCount / analyzed) * 100).toFixed(2)) : 0,
      timestamp: new Date(),
    };
  }

  /**
   * 🛠️ MANUAL MATCH (CONCILIAÇÃO FORÇADA)
   * Vincula manualmente uma transação a uma nota fiscal.
   */
  async manualMatch(
    companyId: string,
    transactionId: string,
    invoiceId: string,
    userId: string,
  ) {
    this.logger.warn(
      `[Manual-Match] User=${userId} vinculando Tx=${transactionId} à Inv=${invoiceId}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      // Verificação de existência via extended para evitar vincular notas "deletadas"
      const [trn, inv] = await Promise.all([
        this.prisma.extended.bankTransaction.findUnique({
          where: { id: transactionId },
        }),
        this.prisma.extended.invoice.findUnique({ where: { id: invoiceId } }),
      ]);

      if (!trn || !inv)
        throw new NotFoundException(
          'Transação ou Nota não encontrada (ou excluída).',
        );
      if (trn.reconciled || inv.reconciled)
        throw new BadRequestException('Um dos registros já está conciliado.');

      const result = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: {
          reconciled: true,
          invoiceId: inv.id,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { reconciled: true, status: InvoiceStatus.PAID },
      });

      await tx.auditLog.create({
        data: {
          userId,
          companyId,
          action: 'MANUAL_RECONCILIATION',
          module: 'RECONCILIATION',
          entity: 'BankTransaction',
          entityId: transactionId,
          payload: { invoiceId, reason: 'Manual override' },
          statusCode: 201,
        },
      });

      return result;
    });
  }

  /**
   * ⏪ UNDO MATCH (DESFAZER CONCILIAÇÃO)
   * Libera a nota e a transação.
   */
  async undoMatch(transactionId: string, userId: string) {
    const transaction = await this.prisma.extended.bankTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, companyId: true, reconciled: true, invoiceId: true },
    });

    if (!transaction || !transaction.reconciled || !transaction.invoiceId) {
      throw new NotFoundException('Transação não disponível para desfazer.');
    }

    await this.prisma.$transaction([
      this.prisma.bankTransaction.update({
        where: { id: transactionId },
        data: { reconciled: false, invoiceId: null },
      }),
      this.prisma.invoice.update({
        where: { id: transaction.invoiceId },
        data: { reconciled: false, status: InvoiceStatus.NORMAL },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: userId || this.SYSTEM_USER_ID,
          companyId: transaction.companyId,
          action: 'UNDO_RECONCILIATION',
          module: 'RECONCILIATION',
          entity: 'BankTransaction',
          entityId: transactionId,
          payload: { previousInvoiceId: transaction.invoiceId },
          statusCode: 200,
        },
      }),
    ]);

    return { status: 'SUCCESS', transactionId };
  }

  /**
   * 🧠 ENGINE DE BUSCA (PRIVATE)
   * Regra de Elite: Valor exato + Janela dinâmica de 7 dias (D-7 a D+2).
   */
  private async findInvoiceMatch(
    companyId: string,
    trn: { amount: Prisma.Decimal; occurredAt: Date },
  ) {
    const fromDate = new Date(
      trn.occurredAt.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const toDate = new Date(trn.occurredAt.getTime() + 2 * 24 * 60 * 60 * 1000);

    return this.prisma.extended.invoice.findFirst({
      where: {
        companyId,
        reconciled: false,
        status: { in: [InvoiceStatus.NORMAL, InvoiceStatus.PENDING] },
        amount: trn.amount,
        issuedAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { issuedAt: 'asc' },
    });
  }
}
