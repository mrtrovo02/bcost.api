'use strict';

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
import { TenantContext } from '#common/tenant/tenant.context.js';

/**
 * Models que obrigatoriamente filtram por companyId.
 */
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
  'TaxReformRate',
  'TaxDestinationRule',
  'Asset',
  'Budget',
  'CostCenter',
  'PaymentCustomer',
  'Subscription',
  'CheckoutSession',
  'PaymentWebhookEvent',
]);

const SOFT_DELETE_MODELS = new Set<string>([
  'User',
  'Company',
  'CompanyUser',
  'Invoice',
  'BankAccount',
  'Customer',
  'Contract',
  'Employee',
  'AccountingEntry',
]);

type MutablePrismaArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
};

type SoftDeleteDelegate = {
  update(args: {
    where?: Record<string, unknown>;
    data: { deletedAt: Date };
  }): Promise<unknown>;
  updateMany(args: {
    where?: Record<string, unknown>;
    data: { deletedAt: Date };
  }): Promise<unknown>;
};

type PrismaDelegateRegistry = Record<string, unknown>;

type PrismaEventEmitter = {
  $on(event: 'query', cb: (e: Prisma.QueryEvent) => void): void;
  $on(event: 'error', cb: (e: Prisma.LogEvent) => void): void;
};

type SetConfigResult = Array<{ set_config: string }>;
type RlsTransactionHandler<T> = (
  transaction: Prisma.TransactionClient,
) => Promise<T>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;
  private _connected = false;
  private disconnectPromise: Promise<void> | null = null;

  // Tipagem dinâmica: mantém o IntelliSense das extensões do Prisma Client
  public readonly extended = this.applyExtensions();

  constructor(private readonly config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const usesPgBouncer =
      connectionString.includes('pgbouncer=true') ||
      connectionString.includes('pgbouncer=1');

    const pool = new pg.Pool({
      connectionString,
      max: usesPgBouncer ? 3 : 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      maxUses: 7500, // Previne memory leaks em conexões longas
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
      ],
    });

    this.pool = pool;
    this.registerEventListeners();
  }

  get isConnected(): boolean {
    return this._connected;
  }

  private getSoftDeleteDelegate(model: string): SoftDeleteDelegate | null {
    const registry = this as unknown as PrismaDelegateRegistry;
    const delegate = registry[model];

    if (!delegate || typeof delegate !== 'object') return null;

    const candidate = delegate as Partial<SoftDeleteDelegate>;

    if (
      typeof candidate.update !== 'function' ||
      typeof candidate.updateMany !== 'function'
    ) {
      return null;
    }

    return candidate as SoftDeleteDelegate;
  }

  async onModuleInit(): Promise<void> {
    // PostgreSQL RLS esta habilitado por migration para as tabelas criticas de cliente.
    // As policies leem `app.current_company_id`; o escopo principal continua vindo do
    // TenantContextGuard/Prisma Extension. Rotinas fiscais sensiveis devem usar
    // withRlsCompanyContext para manter o contexto local e atômico na transação.
    this.connectInBackground();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }

    this.disconnectPromise = this.disconnectOnce();
    return this.disconnectPromise;
  }

  private async disconnectOnce(): Promise<void> {
    this.logger.log('🔌 Desconectando Prisma e encerrando Pool PostgreSQL...');
    this._connected = false;

    try {
      await this.$disconnect();
      await this.pool.end();
      this.logger.log('✅ Pool do PostgreSQL encerrado com sucesso.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Erro ao desconectar do PostgreSQL: ${message}`);
    }
  }

  private connectInBackground(): void {
    const maxAttempts = 5;

    const tryConnect = async (attempt = 1): Promise<void> => {
      if (this.disconnectPromise) {
        return;
      }

      try {
        await this.$connect();

        if (this.disconnectPromise) {
          await this.$disconnect();
          return;
        }

        this._connected = true;
        this.logger.log('✅ Banco de dados conectado via Adapter-PG.');
      } catch (err) {
        const error = err as Error;
        this._connected = false;

        if (attempt <= maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `⚠️ Falha na conexão (${error.message}). Tentativa ${attempt}/${maxAttempts} em ${delay}ms...`,
          );
          setTimeout(() => void tryConnect(attempt + 1), delay);
        } else {
          this.logger.error(
            '🚨 Limite de tentativas de conexão excedido. O banco pode estar inacessível.',
          );
        }
      }
    };

    void tryConnect();
  }

  private applyExtensions() {
    const prismaService = this;

    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = TenantContext.getTenantId();
            const operationArgs = args as MutablePrismaArgs;

            // 1. Multi-tenancy Isolation (Injeção de Tenant)
            if (tenantId && COMPANY_SCOPED_MODELS.has(model)) {
              if (['create', 'createMany'].includes(operation)) {
                if (Array.isArray(operationArgs.data)) {
                  operationArgs.data = operationArgs.data.map((item) => ({
                    ...(typeof item === 'object' && item !== null ? item : {}),
                    companyId: tenantId,
                  }));
                } else {
                  operationArgs.data = {
                    ...((operationArgs.data as Record<string, unknown>) ?? {}),
                    companyId: tenantId,
                  };
                }
              } else if (
                [
                  'findMany',
                  'findFirst',
                  'findFirstOrThrow',
                  'findUnique',
                  'findUniqueOrThrow',
                  'update',
                  'updateMany',
                  'delete',
                  'deleteMany',
                  'count',
                  'aggregate',
                  'groupBy',
                ].includes(operation)
              ) {
                operationArgs.where = {
                  ...((operationArgs.where as Record<string, unknown>) ?? {}),
                  companyId: tenantId,
                };
              }
            }

            // 2. Soft Delete Filter (Global)
            if (
              SOFT_DELETE_MODELS.has(model) &&
              [
                'findMany',
                'findFirst',
                'findFirstOrThrow',
                'findUnique',
                'findUniqueOrThrow',
                'count',
                'aggregate',
                'groupBy',
              ].includes(operation)
            ) {
              const where =
                (operationArgs.where as Record<string, unknown> | undefined) ??
                {};
              if (where.deletedAt === undefined) {
                operationArgs.where = {
                  ...where,
                  deletedAt: null,
                };
              }
            }

            // 3. Interceptador de Delete (Soft Delete obrigatório)
            if (
              SOFT_DELETE_MODELS.has(model) &&
              (operation === 'delete' || operation === 'deleteMany')
            ) {
              const action = operation === 'delete' ? 'update' : 'updateMany';
              const delegate = prismaService.getSoftDeleteDelegate(model);

              if (!delegate) {
                throw new Error(
                  `Hard-delete blocked for ${model}: soft-delete delegate is required.`,
                );
              }

              return await delegate[action]({
                where: operationArgs.where,
                data: { deletedAt: new Date() },
              });
            }

            return query(args);
          },
        },
      },
    });
  }

  setCompanyScope(companyId: string): void {
    TenantContext.patch({ tenantId: companyId });
  }

  clearCompanyScope(): void {
    TenantContext.patch({ tenantId: undefined });
  }

  async setRlsCompanyContext(companyId: string): Promise<void> {
    TenantContext.patch({ tenantId: companyId });

    await this.$queryRaw<SetConfigResult>`
      SELECT set_config('app.current_company_id', ${companyId}, false)
    `;
  }

  async clearRlsCompanyContext(): Promise<void> {
    TenantContext.patch({ tenantId: undefined });

    await this.$queryRaw<SetConfigResult>`
      SELECT set_config('app.current_company_id', '', false)
    `;
  }

  async withRlsCompanyContext<T>(
    companyId: string,
    handler: RlsTransactionHandler<T>,
  ): Promise<T> {
    const normalizedCompanyId = companyId.trim();

    if (!normalizedCompanyId) {
      throw new Error('companyId is required to open an RLS transaction.');
    }

    return this.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT set_config('app.current_company_id', ${normalizedCompanyId}, true)
      `;

      return handler(transaction);
    });
  }

  private registerEventListeners(): void {
    const eventEmitter = this as unknown as PrismaEventEmitter;

    eventEmitter.$on('query', (e: Prisma.QueryEvent) => {
      if (e.duration > 500) {
        this.logger.warn(
          `🐌 Slow Query (${e.duration}ms): ${e.query.substring(0, 200)}...`,
        );
      }
    });

    eventEmitter.$on('error', (e: Prisma.LogEvent) => {
      this.logger.error(`❌ Evento de erro no Prisma: ${e.message}`);
    });
  }

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
}
