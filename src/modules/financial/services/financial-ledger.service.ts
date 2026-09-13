'use strict';

import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateFinancialEventDto } from '../dto/create-financial-event.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class FinancialLedgerService {
  private readonly logger = new Logger(FinancialLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra um evento no Ledger Append-Only.
   * Verifica Balance Lock antes da inserção.
   */
  async recordEvent(
    data: CreateFinancialEventDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { occurredAt, amount, metadata, ...rest } = data;

    // Normalização de data para o Schema
    const dateObj = new Date(occurredAt);
    const month = dateObj.getUTCMonth() + 1;
    const year = dateObj.getUTCFullYear();

    // Validação de Integridade: Balance Lock
    const isLocked = await client.balanceLock.findUnique({
      where: {
        companyId_month_year: {
          companyId: data.companyId,
          month,
          year,
        },
      },
    });

    if (isLocked) {
      this.logger.warn(
        `Tentativa de escrita em período bloqueado: ${month}/${year}`,
      );
      throw new ConflictException(
        `O período ${month}/${year} está encerrado (Balance Locked).`,
      );
    }

    return client.financialEvent.create({
      data: {
        ...rest,
        metadata: metadata as Prisma.InputJsonObject | undefined,
        amount: new Prisma.Decimal(amount), // Garante precisão decimal do Schema
        month,
        year,
        occurredAt: dateObj,
      },
    });
  }
}
