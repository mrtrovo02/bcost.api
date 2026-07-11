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
}
