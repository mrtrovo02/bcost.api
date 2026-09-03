'use strict';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TransactionType, Prisma } from '@prisma/client';

@Injectable()
export class BankingRepository {
  private readonly logger = new Logger(BankingRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  private getCompanyId(
    data: Prisma.BankTransactionUncheckedCreateInput,
  ): string {
    const companyId = data.companyId;

    if (typeof companyId !== 'string' || !companyId.trim()) {
      throw new BadRequestException(
        'companyId é obrigatório para criar transação bancária.',
      );
    }

    return companyId;
  }

  /**
   * Cria uma transação bancária e atualiza o saldo atômico (Cache) da conta.
   * Resolve o erro de propriedade inexistente 'balance' alterando para 'balanceCache'.
   */
  async createTransactionWithBalanceUpdate(
    data: Prisma.BankTransactionUncheckedCreateInput,
  ) {
    const companyId = this.getCompanyId(data);

    return this.prisma.withRlsCompanyContext(companyId, async (tx) => {
      // 1. Tratamento do valor (Amount)
      // Garantimos que o amount seja um Decimal válido para cálculos precisos
      let amountValue: Prisma.Decimal.Value;
      if (data.amount instanceof Prisma.Decimal) {
        amountValue = data.amount;
      } else if (
        typeof data.amount === 'string' ||
        typeof data.amount === 'number'
      ) {
        amountValue = data.amount;
      } else {
        throw new Error('Invalid transaction amount type.');
      }
      const amount = new Prisma.Decimal(amountValue);

      // 2. Registra a transação no extrato
      const transaction = await tx.bankTransaction.create({ data });

      // 3. Define a lógica de ajuste (Crédito soma, Débito subtrai)
      const adjustment =
        data.type === TransactionType.CREDIT ? amount : amount.negated();

      // 4. Atualiza o saldo da conta (Atomic Update)
      // CORREÇÃO TS2353: 'balance' alterado para 'balanceCache' conforme seu schema
      try {
        await tx.bankAccount.update({
          where: { id: data.bankAccountId },
          data: {
            balanceCache: {
              increment: adjustment,
            },
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[Atomic Update Fail] Erro ao atualizar balanceCache: ${message}`,
        );
        throw error;
      }

      return transaction;
    });
  }

  /**
   * Busca saldo total consolidado (Usado pelo CashFlowService)
   */
  async getTotalBalance(companyId: string) {
    const aggregate = await this.prisma.withRlsCompanyContext(
      companyId,
      async (tx) =>
        tx.bankAccount.aggregate({
          where: { companyId },
          _sum: {
            balanceCache: true, // Corrigido de balance para balanceCache
          },
        }),
    );

    return aggregate._sum.balanceCache || new Prisma.Decimal(0);
  }
}
