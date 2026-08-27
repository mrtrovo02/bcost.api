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
import type { BankAccount, BankTransaction } from '@prisma/client';

import { BankingService } from './banking.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { ImportService } from './import.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { LegacyApiAlias } from '../../common/decorators/legacy-api-alias.decorator.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';

type BankingTransactionResponse = {
  id: string;
  companyId: string;
  bankAccountId: string;
  accountId: string;
  description: string;
  amount: number;
  type: BankTransaction['type'];
  direction: 'IN' | 'OUT';
  status: 'POSTED';
  category: string | null;
  document: string | null;
  externalId: string | null;
  reconciled: boolean;
  reconciliationId: string | null;
  date: Date;
  createdAt: Date | null;
  updatedAt: Date | null;
  raw: Prisma.JsonValue | undefined;
};

type BankingAccountResponse = {
  id: string;
  companyId: string;
  bankName: string;
  bankCode: string | null;
  agency: string | null;
  accountNumber: string | null;
  type: 'CHECKING';
  status: 'ACTIVE' | 'DELETED';
  balance: number;
  currency: 'BRL';
  lastSyncAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type BankingSummaryResponse = {
  companyId: string;
  balance: number;
  totalCredits: number;
  totalDebits: number;
  totalTransactions: number;
  reconciledTransactions: number;
  pendingTransactions: number;
  reconciliationRate: number;
  generatedAt: string;
};

/**
 * 🏦 BankingController - API de Operações Bancárias bCost
 *
 * Mantém as funções existentes:
 * - POST /banking/import/:companyId/:bankAccountId
 * - POST /banking/reconcile/:companyId
 * - POST /banking/unmatch/:companyId/:transactionId
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
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
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
      throw new BadRequestException(
        'limit deve ser um número inteiro positivo.',
      );
    }

    return Math.min(parsed, 500);
  }

  private normalizeTransaction(
    tx: BankTransaction,
  ): BankingTransactionResponse {
    const amount = this.toNumber(tx.amount);

    return {
      id: tx.id,
      companyId: tx.companyId,
      bankAccountId: tx.bankAccountId,
      accountId: tx.bankAccountId,
      description: tx.description,
      amount,
      type: tx.type,
      direction: tx.type === 'CREDIT' ? 'IN' : 'OUT',
      status: 'POSTED',
      category: null,
      document: null,
      externalId: null,
      reconciled: tx.reconciled,
      reconciliationId: tx.invoiceId ?? tx.taxObligationId ?? null,
      date: tx.occurredAt,
      createdAt: tx.createdAt,
      updatedAt: null,
      raw: tx.metadata ?? undefined,
    };
  }

  private normalizeAccount(account: BankAccount): BankingAccountResponse {
    return {
      id: account.id,
      companyId: account.companyId,
      bankName: account.bankName,
      bankCode: null,
      agency: account.agency ?? null,
      accountNumber: account.account ?? null,
      type: 'CHECKING',
      status: account.deletedAt ? 'DELETED' : 'ACTIVE',
      balance: this.toNumber(account.balanceCache),
      currency: 'BRL',
      lastSyncAt: null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private async findTransactions(params: {
    companyId: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<BankingTransactionResponse[]> {
    const { companyId, from, to, limit = 100 } = params;

    const baseWhere: Prisma.BankTransactionWhereInput = {
      companyId,
    };

    const dateFilter =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : undefined;

    const where: Prisma.BankTransactionWhereInput = dateFilter
      ? {
          companyId,
          occurredAt: dateFilter,
        }
      : baseWhere;

    try {
      const rows = await this.prisma.bankTransaction.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      });

      return rows.map((tx) => this.normalizeTransaction(tx));
    } catch (error) {
      this.logger.warn(
        `[Banking] Não foi possível listar transações para company=${companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return [];
    }
  }

  private async findAccounts(
    companyId: string,
  ): Promise<BankingAccountResponse[]> {
    try {
      const rows = await this.prisma.bankAccount.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return rows.map((account) => this.normalizeAccount(account));
    } catch (error) {
      this.logger.warn(
        `[Banking] Não foi possível listar contas para company=${companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return [];
    }
  }

  private buildSummary(
    companyId: string,
    transactions: BankingTransactionResponse[],
  ): BankingSummaryResponse {
    const totalCredits = transactions
      .filter((tx) => tx.type === 'CREDIT')
      .reduce((acc, tx) => acc + Number(tx.amount), 0);

    const totalDebits = transactions
      .filter((tx) => tx.type === 'DEBIT')
      .reduce((acc, tx) => acc + Number(tx.amount), 0);

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
  @LegacyApiAlias('/banking/enterprise/transactions/:companyId')
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
  @LegacyApiAlias('/banking/enterprise/accounts/:companyId')
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
  @LegacyApiAlias('/banking/enterprise/summary/:companyId')
  async getSummary(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
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
  @LegacyApiAlias('/banking/enterprise/summary/:companyId')
  async getStatus(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
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
  @LegacyApiAlias('/banking/enterprise/summary/:companyId')
  async getHealth(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
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
  @LegacyApiAlias('/banking/enterprise/transactions/:companyId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadOfx(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('bankAccountId', new ParseUUIDPipe()) bankAccountId: string,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
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

  @Post('upload/:companyId')
  @LegacyApiAlias('/banking/enterprise/transactions/:companyId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadStatementLegacy(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
    @Query('bankAccountId') bankAccountIdFromQuery?: string,
    @Body('bankAccountId') bankAccountIdFromBody?: string,
  ) {
    if (!file) {
      throw new BadRequestException('O arquivo OFX é obrigatório.');
    }

    const bankAccountId = bankAccountIdFromQuery || bankAccountIdFromBody;

    if (!bankAccountId) {
      throw new BadRequestException(
        'bankAccountId é obrigatório para importar extrato bancário. Use /banking/import/:companyId/:bankAccountId ou informe ?bankAccountId=...',
      );
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
  @LegacyApiAlias('/banking/enterprise/reconciliation/:companyId/auto')
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
   * POST /api/v1/banking/unmatch/:companyId/:transactionId
   */
  @Post('unmatch/:companyId/:transactionId')
  @LegacyApiAlias(
    '/banking/enterprise/reconciliation/:companyId/undo/:transactionId',
  )
  async undoMatchForCompany(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body('userId') userId?: string,
  ) {
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

    return await this.reconciliationService.undoMatch(
      transactionId,
      userId || SYSTEM_USER_ID,
      companyId,
    );
  }

  /**
   * ⏪ DESFAZER CONCILIAÇÃO (LEGADO)
   * Mantido para compatibilidade, mas exige companyId em query/body para
   * permitir validação pelo CompanyAccessGuard e pelo serviço.
   *
   * POST /api/v1/banking/unmatch/:transactionId?companyId=...
   */
  @Post('unmatch/:transactionId')
  async undoMatchLegacy(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Query('companyId') companyIdFromQuery?: string,
    @Body('companyId') companyIdFromBody?: string,
    @Body('userId') userId?: string,
  ) {
    const companyId = companyIdFromQuery || companyIdFromBody;

    if (!companyId) {
      throw new BadRequestException(
        'companyId é obrigatório para desfazer conciliação bancária.',
      );
    }

    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

    return await this.reconciliationService.undoMatch(
      transactionId,
      userId || SYSTEM_USER_ID,
      companyId,
    );
  }
}
