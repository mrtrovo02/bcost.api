'use strict';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  InvoiceStatus,
  Prisma,
  TransactionType,
  InvoiceType,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// FIX: referenceMonth string → month + year como Int (alinhado ao schema)
// ---------------------------------------------------------------------------

interface InvoiceSeedData {
  issuedAt: Date;
  amount: number;
  type: InvoiceType;
  status: InvoiceStatus;
  companyId: string;
  customerId: string;
  reconciled: boolean;
}

interface PayrollSeedData {
  totalAmount: number;
  month: number; // FIX: era referenceMonth: string
  year: number; // FIX: campo novo obrigatório
  companyId: string;
}

interface TransactionSeedData {
  amount: number;
  type: TransactionType;
  description: string;
  occurredAt: Date;
  companyId: string;
  reconciled: boolean;
}

interface SeedRecord {
  invoice: InvoiceSeedData;
  payroll: PayrollSeedData;
  transaction: TransactionSeedData;
}

@Injectable()
export class FiscalSeedService {
  private readonly logger = new Logger(FiscalSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gera histórico financeiro de 12 meses para testes de BI e auditoria.
   * Transactional Integrity: cria tudo ou nada.
   */
  async seedCompanyHistory(companyId: string) {
    this.logger.log(
      `[Seed Engine] Gerando histórico estratégico para: ${companyId}`,
    );

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company)
      throw new NotFoundException('Empresa alvo não encontrada no bCost.');

    // Garante Customer
    let customer = await this.prisma.customer.findFirst({
      where: { companyId },
    });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          name: 'Cliente Padrão Seed',
          document: '00.000.000/0001-00',
          companyId,
        },
      });
    }

    // FIX: balance → balanceCache
    let bankAccount = await this.prisma.bankAccount.findFirst({
      where: { companyId },
    });
    if (!bankAccount) {
      bankAccount = await this.prisma.bankAccount.create({
        data: {
          bankName: 'Banco Digital Seed',
          agency: '0001',
          account: '12345-6',
          balanceCache: new Prisma.Decimal(0), // FIX: era 'balance'
          companyId,
        },
      });
    }

    const now = new Date();
    const records: SeedRecord[] = [];

    for (let i = 0; i < 12; i++) {
      const date = new Date(
        Date.UTC(now.getFullYear(), now.getMonth() - i, 15),
      );
      const revenue = 25_000 + Math.random() * 5_000;
      const payroll = 7_500; // Fator R > 28% → garante Anexo III

      records.push(
        this.generateMonthData(companyId, customer.id, date, revenue, payroll),
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Limpeza para idempotência
        await tx.bankTransaction.deleteMany({ where: { companyId } });
        await tx.invoice.deleteMany({ where: { companyId } });
        await tx.payroll.deleteMany({ where: { companyId } });

        for (const record of records) {
          const invoice = await tx.invoice.create({
            data: {
              ...record.invoice,
              amount: new Prisma.Decimal(record.invoice.amount),
            },
          });

          // FIX: era { ...record.payroll, referenceMonth: string }
          // agora usa month + year diretamente da interface corrigida
          await tx.payroll.create({
            data: {
              companyId: record.payroll.companyId,
              month: record.payroll.month,
              year: record.payroll.year,
              totalAmount: new Prisma.Decimal(record.payroll.totalAmount),
            },
          });

          await tx.bankTransaction.create({
            data: {
              ...record.transaction,
              amount: new Prisma.Decimal(record.transaction.amount),
              bankAccountId: bankAccount.id,
              invoiceId: invoice.id, // Conciliação automática
            },
          });
        }

        this.logger.log(
          `[Seed Success] Histórico de 12 meses gerado para ${company.name}`,
        );
        return { status: 'success', months: records.length };
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Seed Failure] Erro crítico na transação: ${message}`);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private generateMonthData(
    companyId: string,
    customerId: string,
    date: Date,
    revenue: number,
    payroll: number,
  ): SeedRecord {
    // FIX: refMonth mantido apenas como label para description — não é mais chave de query
    const refMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    return {
      invoice: {
        issuedAt: date,
        amount: revenue,
        type: InvoiceType.SERVICE,
        status: InvoiceStatus.NORMAL,
        companyId,
        customerId,
        reconciled: true,
      },
      payroll: {
        totalAmount: payroll,
        month: date.getUTCMonth() + 1, // FIX: era referenceMonth: string
        year: date.getUTCFullYear(), // FIX: campo novo
        companyId,
      },
      transaction: {
        amount: revenue,
        type: TransactionType.CREDIT,
        description: `Recebimento ref. ${refMonth}`,
        occurredAt: date,
        companyId,
        reconciled: true,
      },
    };
  }
}
