'use strict';

// =============================================================================
// ARQUIVO: src/modules/banking/banking.service.ts
// =============================================================================

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { parse } from 'ofx-js';
import {
  Prisma,
  TransactionType,
  InvoiceStatus,
  ObligationStatus,
} from '@prisma/client';
import type { BankAccount, BankTransaction } from '@prisma/client';
import {
  OfxData,
  OfxTransaction,
  normalizeOfxTransactions,
  getLedgerBalance,
} from './types/ofx.js';

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // IMPORTAÇÃO OFX
  // ---------------------------------------------------------------------------

  /**
   * Importa extrato bancário OFX com idempotência via FITID.
   *
   * Usa upsert com FITID como ID primário — a mesma transação importada duas
   * vezes é ignorada silenciosamente (update: {}), nunca duplicada.
   *
   * Após a importação, atualiza o balanceCache da conta com o saldo final
   * do extrato OFX (LEDGERBAL), se disponível.
   */
  async importOfx(
    companyId: string,
    bankAccountId: string,
    fileBuffer: Buffer,
  ) {
    this.logger.log(
      `[OFX] Iniciando importação | company=${companyId} | account=${bankAccountId}`,
    );

    if (!fileBuffer?.length) {
      throw new BadRequestException('Arquivo OFX vazio ou inválido.');
    }

    let transactions: OfxTransaction[];
    let ledgerBal: string | number | undefined;

    try {
      const rawData = fileBuffer.toString('utf-8');
      const parsedData = this.parseOfx(rawData);
      const stmtrs = parsedData?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS;
      transactions = normalizeOfxTransactions(stmtrs);
      ledgerBal = getLedgerBalance(stmtrs);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[OFX ERROR] ${message}`);
      throw new BadRequestException(
        'Falha ao processar o arquivo OFX. Verifique o formato.',
      );
    }

    return this.prisma.withRlsCompanyContext(companyId, async (tx) => {
      // Valida se a conta bancária pertence à empresa (segurança multi-tenant)
      const account = await tx.bankAccount.findFirst({
        where: { id: bankAccountId, companyId },
      });

      if (!account) {
        throw new NotFoundException(
          'Conta bancária não encontrada para esta empresa.',
        );
      }

      if (transactions.length === 0) {
        this.logger.warn(`[OFX] Nenhuma transação encontrada no extrato.`);
        return {
          status: 'SUCCESS',
          imported: 0,
          message: 'Extrato sem novas transações.',
        };
      }

      const result: BankTransaction[] = [];

      for (const sourceTransaction of transactions) {
        const trn = this.normalizeTransaction(sourceTransaction);
        const amount = new Prisma.Decimal(trn.amount);

        result.push(
          await tx.bankTransaction.upsert({
            where: { id: trn.fitid },
            update: {}, // Transações bancárias são imutáveis após importação
            create: {
              id: trn.fitid,
              amount: amount.abs(), // sempre positivo — tipo define direção
              description: trn.description.substring(0, 500),
              occurredAt: this.parseOfxDate(trn.postedAt),
              type: amount.isNegative()
                ? TransactionType.DEBIT
                : TransactionType.CREDIT,
              companyId,
              bankAccountId,
              reconciled: false,
              metadata: { fitid: trn.fitid, trnType: trn.type },
            },
          }),
        );
      }

      // Atualiza balanceCache com saldo real do extrato quando disponível
      if (ledgerBal !== undefined) {
        await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: { balanceCache: new Prisma.Decimal(ledgerBal) },
        });
        this.logger.log(`[OFX] balanceCache atualizado: R$ ${ledgerBal}`);
      }

      const imported = result.filter((r) => r.createdAt).length;

      this.logger.log(
        `[OFX] Concluído | total=${result.length} | novas=${imported} | duplicatas=${result.length - imported}`,
      );

      return {
        status: 'SUCCESS',
        total: result.length,
        imported: result.length,
        message: 'Extrato bancário importado com sucesso.',
      };
    });
  }

  // ---------------------------------------------------------------------------
  // EXTRATO E CONSULTAS
  // ---------------------------------------------------------------------------

  /**
   * Extrato bancário por período com paginação por cursor.
   * Cursor-based pagination escala melhor que offset para extratos longos.
   */
  async getStatement(
    companyId: string,
    bankAccountId: string,
    from: Date,
    to: Date,
    cursor?: string,
    take = 50,
  ) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) =>
      tx.bankTransaction.findMany({
        where: {
          companyId,
          bankAccountId,
          occurredAt: { gte: from, lte: to },
        },
        orderBy: { occurredAt: 'asc' },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    );
  }

  async listTransactionsForCompany(params: {
    companyId: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<BankTransaction[]> {
    const { companyId, from, to, limit = 100 } = params;
    const dateFilter =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : undefined;

    const where: Prisma.BankTransactionWhereInput = {
      companyId,
      ...(dateFilter ? { occurredAt: dateFilter } : {}),
    };

    return this.prisma.withRlsCompanyContext(companyId, async (tx) =>
      tx.bankTransaction.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
    );
  }

  async listAccountsForCompany(companyId: string): Promise<BankAccount[]> {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) =>
      tx.bankAccount.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  /**
   * Busca transações com filtros de texto e status de reconciliação.
   */
  async searchTransactions(
    companyId: string,
    query?: string,
    reconciled?: boolean,
    take = 100,
  ) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) =>
      tx.bankTransaction.findMany({
        where: {
          companyId,
          ...(reconciled !== undefined ? { reconciled } : {}),
          ...(query
            ? {
                OR: [
                  { description: { contains: query, mode: 'insensitive' } },
                  { id: { contains: query } },
                ],
              }
            : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // CONCILIAÇÃO MANUAL
  // ---------------------------------------------------------------------------

  /**
   * Vincula manualmente uma transação a uma Nota Fiscal.
   * Operação atômica: atualiza transação e fatura no mesmo commit.
   * Atualiza status da fatura para PAID — reflete no DRE e PnL em tempo real.
   */
  async linkInvoice(
    companyId: string,
    transactionId: string,
    invoiceId: string,
  ) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) => {
      const [trn, inv] = await Promise.all([
        tx.bankTransaction.findFirst({
          where: { id: transactionId, companyId },
        }),
        tx.invoice.findFirst({ where: { id: invoiceId, companyId } }),
      ]);

      if (!trn) throw new NotFoundException('Transação não encontrada.');
      if (!inv) throw new NotFoundException('Nota fiscal não encontrada.');
      if (trn.reconciled)
        throw new BadRequestException('Transação já conciliada.');
      if (inv.reconciled)
        throw new BadRequestException('Nota fiscal já conciliada.');

      const transaction = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { reconciled: true, invoiceId },
      });
      const invoice = await tx.invoice.update({
        where: { id: invoiceId },
        // Atualiza para PAID — impacta DRE e dashboard de inadimplência
        data: { reconciled: true, status: InvoiceStatus.PAID },
      });

      return [transaction, invoice];
    });
  }

  /**
   * Vincula transação a uma obrigação fiscal (DAS, GPS, DARF).
   * Marca a obrigação como PAID — remove dos alertas de vencimento.
   */
  async linkTaxObligation(
    companyId: string,
    transactionId: string,
    taxObligationId: string,
  ) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) => {
      const [trn, obligation] = await Promise.all([
        tx.bankTransaction.findFirst({
          where: { id: transactionId, companyId },
        }),
        tx.taxObligation.findFirst({
          where: { id: taxObligationId, companyId },
        }),
      ]);

      if (!trn) throw new NotFoundException('Transação não encontrada.');
      if (!obligation)
        throw new NotFoundException('Obrigação fiscal não encontrada.');
      if (trn.reconciled)
        throw new BadRequestException('Transação já conciliada.');

      const transaction = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { taxObligationId, reconciled: true },
      });
      const updatedObligation = await tx.taxObligation.update({
        where: { id: taxObligationId },
        data: { status: ObligationStatus.PAID },
      });

      return [transaction, updatedObligation];
    });
  }

  /**
   * Desfaz uma conciliação — libera transação e nota/obrigação para rematch.
   * Essencial para correção de erros do auto-match.
   */
  async unlinkTransaction(companyId: string, transactionId: string) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) => {
      const trn = await tx.bankTransaction.findFirst({
        where: { id: transactionId, companyId },
        select: {
          id: true,
          reconciled: true,
          invoiceId: true,
          taxObligationId: true,
        },
      });

      if (!trn) throw new NotFoundException('Transação não encontrada.');
      if (!trn.reconciled)
        throw new BadRequestException('Transação não está conciliada.');

      await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { reconciled: false, invoiceId: null, taxObligationId: null },
      });

      if (trn.invoiceId) {
        await tx.invoice.update({
          where: { id: trn.invoiceId },
          data: { reconciled: false, status: InvoiceStatus.NORMAL },
        });
      }

      if (trn.taxObligationId) {
        await tx.taxObligation.update({
          where: { id: trn.taxObligationId },
          data: { status: ObligationStatus.PENDING },
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // RESUMO FINANCEIRO
  // ---------------------------------------------------------------------------

  /**
   * Resumo de entradas e saídas por período.
   * Fonte de verdade para o saldo real (não o balanceCache).
   * balanceCache é um cache para performance — este método recalcula do ledger.
   */
  async getFinancialSummary(companyId: string, from?: Date, to?: Date) {
    const dateFilter = from && to ? { gte: from, lte: to } : undefined;

    const [creditAgg, debitAgg, accountsAgg] =
      await this.prisma.withRlsCompanyContext(companyId, async (tx) =>
        Promise.all([
          tx.bankTransaction.aggregate({
            where: {
              companyId,
              type: TransactionType.CREDIT,
              ...(dateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { amount: true },
            _count: true,
          }),
          tx.bankTransaction.aggregate({
            where: {
              companyId,
              type: TransactionType.DEBIT,
              ...(dateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { amount: true },
            _count: true,
          }),
          // Saldo em cache das contas (snapshot rápido para dashboard)
          tx.bankAccount.aggregate({
            where: { companyId },
            _sum: { balanceCache: true },
          }),
        ]),
      );

    const totalCredit = creditAgg._sum.amount?.toNumber() ?? 0;
    const totalDebit = debitAgg._sum.amount?.toNumber() ?? 0;

    return {
      totalCredit,
      totalDebit,
      // Saldo calculado do ledger (fonte de verdade)
      ledgerBalance: totalCredit - totalDebit,
      // Saldo em cache das contas (para dashboards — pode divergir do ledger)
      cachedBalance: accountsAgg._sum.balanceCache?.toNumber() ?? 0,
      transactions: {
        credits: creditAgg._count,
        debits: debitAgg._count,
        total: creditAgg._count + debitAgg._count,
      },
    };
  }

  /**
   * Saldo atual de uma conta específica calculado do ledger de transações.
   * Mais preciso que o balanceCache para fins contábeis.
   */
  async getAccountBalance(companyId: string, bankAccountId: string) {
    return this.prisma.withRlsCompanyContext(companyId, async (tx) => {
      const account = await tx.bankAccount.findFirst({
        where: { id: bankAccountId, companyId },
      });
      if (!account)
        throw new NotFoundException('Conta bancária não encontrada.');

      const [credits, debits] = await Promise.all([
        tx.bankTransaction.aggregate({
          where: { companyId, bankAccountId, type: TransactionType.CREDIT },
          _sum: { amount: true },
        }),
        tx.bankTransaction.aggregate({
          where: { companyId, bankAccountId, type: TransactionType.DEBIT },
          _sum: { amount: true },
        }),
      ]);

      const ledger =
        (credits._sum.amount?.toNumber() ?? 0) -
        (debits._sum.amount?.toNumber() ?? 0);

      return {
        bankAccountId,
        bankName: account.bankName,
        agency: account.agency,
        account: account.account,
        ledgerBalance: ledger,
        cachedBalance: account.balanceCache.toNumber(),
        // Divergência entre cache e ledger — útil para detectar importações perdidas
        drift: Number((ledger - account.balanceCache.toNumber()).toFixed(2)),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // INTERNAL
  // ---------------------------------------------------------------------------

  /**
   * Converte data OFX (YYYYMMDDHHMMSS[±offset]) para Date UTC.
   * Sempre usa meio-dia UTC para evitar erros de fuso horário em datas diárias.
   */
  private parseOfxDate(ofxDate: string): Date {
    try {
      const year = Number(ofxDate.substring(0, 4));
      const month = Number(ofxDate.substring(4, 6)) - 1;
      const day = Number(ofxDate.substring(6, 8));
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    } catch {
      this.logger.warn(
        `[OFX] Data inválida: ${ofxDate} — usando now() como fallback`,
      );
      return new Date();
    }
  }

  private parseOfx(rawData: string): OfxData {
    const parseOfx = parse as (input: string) => unknown;
    const parsed = parseOfx(rawData);
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('Arquivo OFX inválido ou incompleto.');
    }
    return parsed as OfxData;
  }

  private normalizeTransaction(trn: OfxTransaction): {
    fitid: string;
    amount: string | number;
    postedAt: string;
    description: string;
    type?: string;
  } {
    if (!trn.FITID || trn.TRNAMT === undefined || !trn.DTPOSTED) {
      throw new BadRequestException('Transação OFX inválida ou incompleta.');
    }

    return {
      fitid: trn.FITID,
      amount: trn.TRNAMT,
      postedAt: trn.DTPOSTED,
      description: trn.MEMO || trn.NAME || 'Transação Bancária',
      type: trn.TRNTYPE,
    };
  }
}
