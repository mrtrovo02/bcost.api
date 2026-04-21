'use strict';

// =============================================================================
// ARQUIVO: src/database/prisma.service.ts
// =============================================================================

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { TenantContext } from '#/common/tenant/tenant.context.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SLOW_QUERY_THRESHOLD_MS = 500;
const COMPANY_SCOPED_MODELS = new Set<string>([
  'CompanyUser',
  'Invoice',
  'BankTransaction',
  'BankAccount',
  'BalanceLock',
  'Customer',
  'Contract',
  'TaxObligation',
  'TaxCalculation',
  'FiscalObligation',
  'Payroll',
  'PayrollEntry',
  'Employee',
  'NotificationLog',
  'AuditLog',
  'ComplianceCheck',
  'AutomationJob',
  'BusinessRule',
  'DigitalCertificate',
  'WebhookConfig',
  'FinancialEvent',
  'FinancialSnapshot',
  'CashFlowProjection',
  'AccountingEntry',
  'AccountPlan',
]);

// ---------------------------------------------------------------------------
// PrismaService
// ---------------------------------------------------------------------------

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  public extended: PrismaClient;

  /**
   * Status de conectividade — consultado pelo HealthCheck.
   * false durante o bootstrap até a conexão ser estabelecida.
   */
  private _connected = false;

  private get currentCompanyId(): string | undefined {
    return TenantContext.getTenantId();
  }

  constructor(private readonly config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');

    const usesPgBouncer =
      connectionString.includes('pgbouncer=true') ||
      connectionString.includes('pgbouncer=1');

    const pool = new pg.Pool({
      connectionString,
      max: usesPgBouncer ? 2 : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: usesPgBouncer ? 10_000 : 5_000,
      maxUses: 7_500,
      allowExitOnIdle: false,
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'colorless',
    });

    this.registerEventListeners();
    this.applyExtensions();

    this.logger.log(
      `🚀 Prisma Enterprise Client iniciado. [pool: max=${usesPgBouncer ? 2 : 10}, pgbouncer=${usesPgBouncer}]`,
    );
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * FIX CRÍTICO — BOOTSTRAP TRAVADO:
   *
   * O onModuleInit() é chamado pelo NestJS durante o NestFactory.create(),
   * ANTES do servidor começar a ouvir requisições. Se este método bloquear
   * (await longo), o bootstrap inteiro trava.
   *
   * PROBLEMA ORIGINAL:
   * connectWithRetry() tinha maxAttempts=5, CONNECT_TIMEOUT_MS=10_000 e
   * delays exponenciais (2s, 4s, 8s, 16s). Pior caso = 80 segundos.
   * A conexão ao Supabase via PgBouncer demora na primeira tentativa
   * e caia no retry loop completo — travando o bootstrap na "Etapa 1".
   *
   * SOLUÇÃO: conexão assíncrona não-bloqueante (fire-and-forget).
   * O onModuleInit() retorna IMEDIATAMENTE sem await.
   * A conexão acontece em background via connectInBackground().
   * O bootstrap continua e o servidor sobe normalmente.
   * O HealthCheck reporta o status real via isHealthy().
   */
  async onModuleInit(): Promise<void> {
    // Fire-and-forget — não bloqueia o bootstrap
    this.connectInBackground();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('🔌 Encerrando conexões Prisma...');
    try {
      await this.$disconnect();
      this.logger.log('✅ Prisma desconectado com sucesso.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Erro ao desconectar Prisma: ${message}`);
    }
  }

  /**
   * Conecta em background sem bloquear o bootstrap.
   * Tenta reconectar com backoff exponencial sem limite de tentativas.
   * O servidor já está ouvindo enquanto isso acontece.
   */
  private connectInBackground(): void {
    const maxAttempts = 5;
    const baseDelayMs = 2_000;

    const tryConnect = async (attempt: number): Promise<void> => {
      try {
        await Promise.race([
          this.$connect(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Timeout de conexão após 8s')),
              8_000,
            ),
          ),
        ]);

        this._connected = true;
        this.logger.log('✅ Banco de dados conectado com sucesso.');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (attempt >= maxAttempts) {
          this.logger.error(
            `🚨 Banco indisponível após ${maxAttempts} tentativas: ${message}. ` +
              'O servidor está UP mas queries falharão até reconexão.',
          );
          // Agenda nova tentativa após 30s — sem travar o processo
          setTimeout(() => this.connectInBackground(), 30_000);
          return;
        }

        const delay = baseDelayMs * 2 ** (attempt - 1);
        this.logger.warn(
          `⚠️ Tentativa ${attempt}/${maxAttempts} falhou (${message}). Retry em ${delay}ms...`,
        );

        setTimeout(() => tryConnect(attempt + 1), delay);
      }
    };

    // Primeira tentativa após 100ms — dá tempo do bootstrap terminar
    setTimeout(() => tryConnect(1), 100);
  }

  // -------------------------------------------------------------------------
  // Multi-tenant scope (mantidos por compatibilidade)
  // -------------------------------------------------------------------------

  /** @deprecated Use TenantContext diretamente. */
  setCompanyScope(_companyId: string): void {
    this.logger.warn('⚠️ setCompanyScope está obsoleto. Use TenantContext.');
  }

  /** @deprecated Use TenantContext diretamente. */
  clearCompanyScope(): void {
    this.logger.warn('⚠️ clearCompanyScope está obsoleto. Use TenantContext.');
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      this._connected = true;
      return true;
    } catch {
      this._connected = false;
      return false;
    }
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T> {
    return this.$transaction(fn, {
      maxWait: options?.maxWait ?? 5_000,
      timeout: options?.timeout ?? 10_000,
      isolationLevel:
        options?.isolationLevel ??
        Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  /** @deprecated Use runInTransaction() para tipagem forte. */
  async executeTransaction<T>(fn: (prisma: any) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => fn(tx));
  }

  // -------------------------------------------------------------------------
  // Extensions (Soft Delete + Company Scope + Computed Fields)
  // -------------------------------------------------------------------------

  private applyExtensions(): void {
    const service = this;

    const extended = this.$extends({
      query: {
        $allModels: {
          async create({ model, args, query }) {
            if (
              service.currentCompanyId &&
              COMPANY_SCOPED_MODELS.has(model) &&
              (args.data as any).companyId === undefined
            ) {
              (args.data as any).companyId = service.currentCompanyId;
            }
            return query(args);
          },

          async update({ model, args, query }) {
            args.where = (args.where ?? {}) as any;
            if (service.currentCompanyId && COMPANY_SCOPED_MODELS.has(model)) {
              (args.where as any).companyId = service.currentCompanyId;
            }
            if ((args.where as any).deletedAt === undefined) {
              (args.where as any).deletedAt = null;
            }
            return query(args);
          },

          async updateMany({ model, args, query }) {
            args.where = (args.where ?? {}) as any;
            if (service.currentCompanyId && COMPANY_SCOPED_MODELS.has(model)) {
              (args.where as any).companyId = service.currentCompanyId;
            }
            if ((args.where as any).deletedAt === undefined) {
              (args.where as any).deletedAt = null;
            }
            return query(args);
          },

          async delete({ model, args }) {
            try {
              return await (service as any)[model].update({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            } catch {
              return (service as any)[model].delete(args);
            }
          },

          async deleteMany({ model, args }) {
            try {
              return await (service as any)[model].updateMany({
                where: args.where,
                data: { deletedAt: new Date() },
              });
            } catch {
              return (service as any)[model].deleteMany(args);
            }
          },

          async findMany({ model, args, query }) {
            args.where = (args.where ?? {}) as any;
            if (service.currentCompanyId && COMPANY_SCOPED_MODELS.has(model)) {
              (args.where as any).companyId = service.currentCompanyId;
            }
            if ((args.where as any).deletedAt === undefined) {
              (args.where as any).deletedAt = null;
            }
            return query(args);
          },

          async findFirst({ model, args, query }) {
            args.where = (args.where ?? {}) as any;
            if (service.currentCompanyId && COMPANY_SCOPED_MODELS.has(model)) {
              (args.where as any).companyId = service.currentCompanyId;
            }
            if ((args.where as any).deletedAt === undefined) {
              (args.where as any).deletedAt = null;
            }
            return query(args);
          },

          async findUnique({ model, args }) {
            const where: any = {
              ...(args.where as any),
              deletedAt: null,
            };
            if (service.currentCompanyId && COMPANY_SCOPED_MODELS.has(model)) {
              where.companyId = service.currentCompanyId;
            }
            return (service as any)[model].findFirst({ where });
          },
        },
      },

      result: {
        invoice: {
          isExpired: {
            needs: { issuedAt: true },
            compute(invoice) {
              const fiveYearsAgo = new Date();
              fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
              return invoice.issuedAt < fiveYearsAgo;
            },
          },
        },
      },
    });

    this.extended = extended as unknown as PrismaClient;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private registerEventListeners(): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';

    (this as any).$on(
      'query',
      (event: { query: string; params: string; duration: number }) => {
        const isSlow = event.duration > SLOW_QUERY_THRESHOLD_MS;

        if (isSlow) {
          this.logger.warn(
            `🐌 SLOW QUERY (${event.duration}ms) → ${event.query} | params: ${event.params}`,
          );
          return;
        }

        if (!isProd && this.config.get<string>('DEBUG_QUERIES') === 'true') {
          this.logger.debug(`🗄️  Query (${event.duration}ms) → ${event.query}`);
        }
      },
    );

    (this as any).$on('warn', (event: { message: string }) => {
      this.logger.warn(`⚠️  Prisma warn: ${event.message}`);
    });

    (this as any).$on('error', (event: { message: string }) => {
      this.logger.error(`❌ Prisma error: ${event.message}`);
    });
  }
}
