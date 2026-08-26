import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export interface ReconcileTransactionInput {
  id: string;
}

export interface BankingAutoMatchResult {
  companyId: string;
  processed: number;
  reconciled: number;
  pending: number;
  accuracy: number;
  message: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileTransaction(
    companyId: string,
    data: ReconcileTransactionInput,
    userId: string,
  ) {
    this.logger.log(
      `[RECONCILE] companyId=${companyId} userId=${userId} transactionId=${data.id}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.bankTransaction.findFirst({
        where: { id: data.id, companyId },
      });

      if (!transaction) {
        throw new NotFoundException(
          'Transação bancária não encontrada para esta empresa.',
        );
      }

      return tx.bankTransaction.update({
        where: { id: data.id },
        data: { reconciled: true },
      });
    });
  }

  async runAutoMatch(companyId: string): Promise<BankingAutoMatchResult> {
    this.logger.log(
      `[RECONCILE] Auto-match iniciado para companyId=${companyId}`,
    );

    const pending = await this.prisma.bankTransaction.count({
      where: { companyId, reconciled: false },
    });

    return {
      companyId,
      processed: pending,
      reconciled: 0,
      pending,
      accuracy: 0,
      message:
        pending > 0
          ? 'Conciliação automática legado executada sem candidatos determinísticos. Use o módulo /reconciliation para scoring completo.'
          : 'Nenhuma transação pendente para conciliação.',
    };
  }

  async undoMatch(transactionId: string, userId: string, companyId: string) {
    this.logger.log(
      `[RECONCILE] Desfazendo conciliação companyId=${companyId} transactionId=${transactionId} userId=${userId}`,
    );

    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, companyId },
    });

    if (!transaction) {
      throw new NotFoundException(
        'Transação bancária não encontrada para esta empresa.',
      );
    }

    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { reconciled: false, taxObligationId: null },
    });

    return { transactionId, undone: true, userId };
  }
}
