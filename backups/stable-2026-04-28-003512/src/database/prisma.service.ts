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
  'CompanyUser', 'Invoice', 'BankTransaction', 'BankAccount',
  'BalanceLock', 'Customer', 'Contract', 'TaxObligation',
  'TaxCalculation', 'FiscalObligation', 'Payroll', 'PayrollEntry',
  'Employee', 'NotificationLog', 'AuditLog', 'ComplianceCheck',
  'AutomationJob', 'BusinessRule', 'DigitalCertificate', 'WebhookConfig',
  'FinancialEvent', 'FinancialSnapshot', 'CashFlowProjection',
  'AccountingEntry', 'AccountPlan', 'Asset', 'Budget', 'CostCenter'
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private _connected = false;

  // Tipagem dinâmica: mantém o IntelliSense das extensões
  public readonly extended = this.applyExtensions();

  constructor(private readonly config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const usesPgBouncer = connectionString.includes('pgbouncer=true') || connectionString.includes('pgbouncer=1');

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

    this.registerEventListeners();
  }

  async onModuleInit() {
    this.connectInBackground();
  }

  async onModuleDestroy() {
    this.logger.log('🔌 Desconectando Prisma...');
    await this.$disconnect();
  }

  private connectInBackground() {
    const maxAttempts = 5;
    
    const tryConnect = async (attempt = 1) => {
      try {
        await this.$connect();
        this._connected = true;
        this.logger.log('✅ Banco de dados conectado via Adapter-PG.');
      } catch (err) {
        const error = err as Error;
        if (attempt <= maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`⚠️ Falha na conexão (${error.message}). Tentativa ${attempt}/${maxAttempts} em ${delay}ms...`);
          setTimeout(() => tryConnect(attempt + 1), delay);
        } else {
          this.logger.error('🚨 Limite de tentativas de conexão excedido. O banco pode estar inacessível.');
        }
      }
    };
    tryConnect();
  }

  private applyExtensions() {
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = TenantContext.getTenantId();

            // 1. Multi-tenancy Isolation
            if (tenantId && COMPANY_SCOPED_MODELS.has(model)) {
              if (['create', 'createMany'].includes(operation)) {
                args.data = { ...(args.data as any), companyId: tenantId };
              } else if (['findMany', 'findFirst', 'findUnique', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
                args.where = { ...(args.where as any), companyId: tenantId };
              }
            }

            // 2. Soft Delete Filter (Global)
            if (['findMany', 'findFirst', 'findUnique', 'count'].includes(operation)) {
              if ((args.where as any)?.deletedAt === undefined) {
                args.where = { ...(args.where as any), deletedAt: null };
              }
            }

            // 3. Interceptador de Delete (Soft Delete com Fallback)
            if (operation === 'delete' || operation === 'deleteMany') {
              try {
                // Tenta fazer o update para setar deletedAt
                const action = operation === 'delete' ? 'update' : 'updateMany';
                return await (this as any)[model][action]({
                  where: args.where,
                  data: { deletedAt: new Date() },
                });
              } catch (e) {
                // Se o model não suportar deletedAt, executa o delete real
                this.logger.debug(`Soft-delete não suportado para ${model}, executando hard-delete.`);
                return query(args);
              }
            }

            return query(args);
          },
        },
      },
    });
  }

  private registerEventListeners() {
    (this as any).$on('query', (e: any) => {
      if (e.duration > 500) {
        this.logger.warn(`🐌 Slow Query (${e.duration}ms): ${e.query.substring(0, 200)}...`);
      }
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
