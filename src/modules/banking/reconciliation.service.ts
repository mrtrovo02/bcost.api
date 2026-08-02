import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileTransaction(companyId: string, data: any, userId: string) {
    this.logger.log(
      `[RECONCILE] companyId=${companyId} userId=${userId} transactionId=${data?.id}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      const result = await tx.bankTransaction.update({
        where: { id: data.id },
        data: { reconciled: true },
      });

      return result;
    });
  }

  async runAutoMatch(companyId: string) {
    this.logger.log(`[RECONCILE] Auto-match iniciado para companyId=${companyId}`);

    return {
      companyId,
      reconciled: 0,
      accuracy: 0,
      message: 'Auto-match não implementado no serviço atual.',
    };
  }

  async undoMatch(transactionId: string, userId: string) {
    this.logger.log(
      `[RECONCILE] Desfazendo conciliação transactionId=${transactionId} userId=${userId}`,
    );

    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { reconciled: false, taxObligationId: null },
    });

    return { transactionId, undone: true, userId };
  }
}
