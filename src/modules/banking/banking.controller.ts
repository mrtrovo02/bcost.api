'use strict';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';

import { BankingService } from './banking.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { ImportService } from './import.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';

/**
 * 🏦 BankingController - API de Operações Bancárias bCost
 *
 * Mantém as funções existentes:
 * - POST /banking/import/:companyId/:bankAccountId
 * - POST /banking/reconcile/:companyId
 * - POST /banking/unmatch/:transactionId
 *
 * Adiciona compatibilidade com o frontend atual:
 * - GET /banking/transactions/:companyId
 * - GET /banking/summary/:companyId
 * - GET /banking/status/:companyId
 * - GET /banking/accounts/:companyId
 * - GET /banking/health/:companyId
 *
 * Objetivo SaaS:
 * - Não retornar 404 quando ainda não houver integração bancária conectada.
 * - Retornar estruturas normalizadas para dashboards, conciliação e UX fintech.
 * - Preparar o bCost para Open Finance, OFX/CSV, conciliação automática e alertas.
 */
@Controller('banking')
@UseGuards(JwtAuthGuard)
export class BankingController {
  private readonly logger = new Logger(BankingController.name);

  constructor(
    private readonly bankingService: BankingService,
    private readonly reconciliationService: ReconciliationService,
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseOptionalDate(
    value: unknown,
    fieldName: string,
  ): Date | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = new Date(String(value));

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} deve ser uma data válida.`);
    }

    return parsed;
  }

  private parseOptionalLimit(value: unknown, fallback = 100): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('limit deve ser um número inteiro positivo.');
    }

    return Math.min(parsed, 500);
  }

  private getPrismaModelByCandidates(candidates: string[]) {
    const prismaAny = this.prisma as any;

    for (const candidate of candidates) {
      if (prismaAny?.[candidate]?.findMany) {
        return prismaAny[candidate];
      }

      if (prismaAny?.extended?.[candidate]?.findMany) {
        return prismaAny.extended[candidate];
      }
    }

    return null;
  }

  private normalizeTransaction(tx: any) {
    const amount = this.toNumber(
      tx.amount ??
        tx.value ??
        tx.total ??
        tx.transactionAmount ??
        tx.valor ??
        0,
    );

    const date =
      tx.date ??
      tx.transactionDate ??
      tx.postedAt ??
      tx.paidAt ??
      tx.createdAt ??
      new Date();

    return {
      id: tx.id,
      companyId: tx.companyId,
      bankAccountId: tx.bankAccountId ?? tx.accountId ?? null,
      accountId: tx.accountId ?? tx.bankAccountId ?? null,
      description:
        tx.description ??
        tx.memo ??
        tx.title ??
        tx.name ??
        tx.history ??
        'Transação bancária',
      amount,
      type:
        tx.type ??
        tx.transactionType ??
        (amount >= 0 ? 'CREDIT' : 'DEBIT'),
      direction: amount >= 0 ? 'IN' : 'OUT',
      status: tx.status ?? 'POSTED',
      category: tx.category ?? tx.categoryName ?? null,
      document: tx.document ?? tx.documentNumber ?? tx.cpfCnpj ?? null,
      externalId:
        tx.externalId ??
        tx.providerId ??
        tx.ofxId ??
        tx.fitId ??
        null,
      reconciled: Boolean(tx.reconciled ?? tx.isReconciled ?? false),
      reconciliationId: tx.reconciliationId ?? null,
      date,
      createdAt: tx.createdAt ?? null,
      updatedAt: tx.updatedAt ?? null,
      raw: tx.raw ?? undefined,
    };
  }

  private normalizeAccount(account: any) {
    return {
      id: account.id,
      companyId: account.companyId,
      bankName:
        account.bankName ??
        account.bank ??
        account.provider ??
        'Conta bancária',
      bankCode: account.bankCode ?? account.code ?? null,
      agency: account.agency ?? null,
      accountNumber:
        account.accountNumber ??
        account.number ??
        account.account ??
        null,
      type: account.type ?? account.accountType ?? 'CHECKING',
      status: account.status ?? 'ACTIVE',
      balance: this.toNumber(account.balance ?? account.currentBalance ?? 0),
      currency: account.currency ?? 'BRL',
      lastSyncAt: account.lastSyncAt ?? null,
      createdAt: account.createdAt ?? null,
      updatedAt: account.updatedAt ?? null,
    };
  }

  private async findTransactions(params: {
    companyId: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const { companyId, from, to, limit = 100 } = params;

    const model = this.getPrismaModelByCandidates([
      'bankTransaction',
      'bankingTransaction',
      'financialTransaction',
      'transaction',
      'cashTransaction',
    ]);

    if (!model) {
      return [];
    }

    const baseWhere: Record<string, unknown> = {
      companyId,
    };

    const dateFilter =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : undefined;

    const whereWithDate = dateFilter
      ? {
          companyId,
          OR: [
            { date: dateFilter },
            { transactionDate: dateFilter },
            { postedAt: dateFilter },
            { paidAt: dateFilter },
            { createdAt: dateFilter },
          ],
        }
      : baseWhere;

    const orderCandidates = [
      [{ date: 'desc' }, { createdAt: 'desc' }],
      [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      [{ postedAt: 'desc' }, { createdAt: 'desc' }],
      { createdAt: 'desc' },
    ];

    for (const orderBy of orderCandidates) {
      try {
        const rows = await model.findMany({
          where: whereWithDate,
          orderBy,
          take: limit,
        });

        return Array.isArray(rows) ? rows.map((tx) => this.normalizeTransaction(tx)) : [];
      } catch {
        // tenta próximo formato de orderBy/campo
      }
    }

    try {
      const rows = await model.findMany({
        where: baseWhere,
        take: limit,
      });

      return Array.isArray(rows) ? rows.map((tx) => this.normalizeTransaction(tx)) : [];
    } catch (error) {
      this.logger.warn(
        `[Banking] Não foi possível listar transações para company=${companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return [];
    }
  }

  private async findAccounts(companyId: string) {
    const model = this.getPrismaModelByCandidates([
      'bankAccount',
      'bankingAccount',
      'financialAccount',
      'account',
    ]);

    if (!model) {
      return [];
    }

    try {
      const rows = await model.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return Array.isArray(rows) ? rows.map((account) => this.normalizeAccount(account)) : [];
    } catch {
      try {
        const rows = await model.findMany({
          where: { companyId },
          take: 100,
        });

        return Array.isArray(rows) ? rows.map((account) => this.normalizeAccount(account)) : [];
      } catch (error) {
        this.logger.warn(
          `[Banking] Não foi possível listar contas para company=${companyId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        return [];
      }
    }
  }

  private buildSummary(companyId: string, transactions: any[]) {
    const totalCredits = transactions
      .filter((tx) => Number(tx.amount) > 0)
      .reduce((acc, tx) => acc + Number(tx.amount), 0);

    const totalDebits = transactions
      .filter((tx) => Number(tx.amount) < 0)
      .reduce((acc, tx) => acc + Math.abs(Number(tx.amount)), 0);

    const reconciled = transactions.filter((tx) => tx.reconciled).length;
    const pending = transactions.length - reconciled;

    return {
      companyId,
      balance: Number((totalCredits - totalDebits).toFixed(2)),
      totalCredits: Number(totalCredits.toFixed(2)),
      totalDebits: Number(totalDebits.toFixed(2)),
      totalTransactions: transactions.length,
      reconciledTransactions: reconciled,
      pendingTransactions: pending,
      reconciliationRate:
        transactions.length > 0
          ? Number(((reconciled / transactions.length) * 100).toFixed(2))
          : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Consultas usadas pelo frontend
  // ---------------------------------------------------------------------------

  /**
   * Lista transações bancárias da empresa.
   *
   * GET /api/v1/banking/transactions/:companyId
   */
  @Get('transactions/:companyId')
  async listTransactions(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedFrom = this.parseOptionalDate(from, 'from');
    const parsedTo = this.parseOptionalDate(to, 'to');
    const parsedLimit = this.parseOptionalLimit(limit, 100);

    this.logger.log(
      `[Banking] Listando transações company=${companyId}, limit=${parsedLimit}`,
    );

    return await this.findTransactions({
      companyId,
      from: parsedFrom,
      to: parsedTo,
      limit: parsedLimit,
    });
  }

  /**
   * Lista contas bancárias conectadas/importadas.
   *
   * GET /api/v1/banking/accounts/:companyId
   */
  @Get('accounts/:companyId')
  async listAccounts(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    this.logger.log(`[Banking] Listando contas company=${companyId}`);

    return await this.findAccounts(companyId);
  }

  /**
   * Resumo bancário para cards e cockpit financeiro.
   *
   * GET /api/v1/banking/summary/:companyId
   */
  @Get('summary/:companyId')
  async getSummary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    const transactions = await this.findTransactions({
      companyId,
      limit: 500,
    });

    return this.buildSummary(companyId, transactions);
  }

  /**
   * Status de integração bancária.
   *
   * GET /api/v1/banking/status/:companyId
   */
  @Get('status/:companyId')
  async getStatus(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    const [accounts, transactions] = await Promise.all([
      this.findAccounts(companyId),
      this.findTransactions({
        companyId,
        limit: 500,
      }),
    ]);

    const summary = this.buildSummary(companyId, transactions);

    return {
      companyId,
      connected: accounts.length > 0,
      provider: accounts.length > 0 ? accounts[0].bankName : null,
      status: accounts.length > 0 ? 'CONNECTED' : 'PENDING_INTEGRATION',
      message:
        accounts.length > 0
          ? 'Integração bancária disponível.'
          : 'Integração bancária ainda não conectada. Use importação OFX/CSV ou conecte Open Finance futuramente.',
      accounts,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Health check de banking para observabilidade.
   *
   * GET /api/v1/banking/health/:companyId
   */
  @Get('health/:companyId')
  async getHealth(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    const [accounts, transactions] = await Promise.all([
      this.findAccounts(companyId),
      this.findTransactions({
        companyId,
        limit: 500,
      }),
    ]);

    const summary = this.buildSummary(companyId, transactions);

    return {
      companyId,
      module: 'banking',
      status: 'OK',
      accounts: accounts.length,
      transactions: transactions.length,
      pendingReconciliation: summary.pendingTransactions,
      reconciliationRate: summary.reconciliationRate,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Operações existentes preservadas
  // ---------------------------------------------------------------------------

  /**
   * 📤 IMPORTAÇÃO DE EXTRATO (OFX)
   * Recebe o arquivo, extrai transações e dispara a conciliação automática.
   *
   * POST /api/v1/banking/import/:companyId/:bankAccountId
   */
  @Post('import/:companyId/:bankAccountId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadOfx(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('bankAccountId', new ParseUUIDPipe()) bankAccountId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('O arquivo OFX é obrigatório.');
    }

    return await this.importService.importOfx(
      companyId,
      bankAccountId,
      file.buffer,
    );
  }

  /**
   * ⚙️ GATILHO DE CONCILIAÇÃO MANUAL
   * Força o motor de auto-match a varrer transações e notas pendentes.
   *
   * POST /api/v1/banking/reconcile/:companyId
   */
  @Post('reconcile/:companyId')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerReconciliation(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    return await this.reconciliationService.runAutoMatch(companyId);
  }

  /**
   * ⏪ DESFAZER CONCILIAÇÃO
   * Útil para correções do usuário quando o auto-match erra.
   *
   * POST /api/v1/banking/unmatch/:transactionId
   */
  @Post('unmatch/:transactionId')
  async undoMatch(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body('userId') userId?: string,
  ) {
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

    return await this.reconciliationService.undoMatch(
      transactionId,
      userId || SYSTEM_USER_ID,
    );
  }
}
