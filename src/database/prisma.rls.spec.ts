'use strict';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { TenantContext } from '#common/tenant/tenant.context.js';

const RLS_MIGRATION_PATH = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260902000000_add_rls_policies',
  'migration.sql',
);
const RLS_HARDENING_MIGRATION_PATH = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260903000000_harden_rls_force_and_coverage',
  'migration.sql',
);

const COMPANY_SCOPED_RLS_TABLES = [
  'invoices',
  'bank_transactions',
  'employees',
  'payrolls',
  'tax_calculations',
  'tax_obligations',
  'fiscal_obligations',
  'accounting_entries',
  'contracts',
  'customers',
  'financial_events',
] as const;

const HARDENED_RLS_TABLES = [
  'companies',
  'company_users',
  'invoices',
  'invoice_sefaz_events',
  'bank_transactions',
  'bank_accounts',
  'balance_locks',
  'customers',
  'contracts',
  'tax_obligations',
  'tax_calculations',
  'fiscal_obligations',
  'employees',
  'payrolls',
  'payroll_entries',
  'account_plans',
  'accounting_entries',
  'financial_events',
  'financial_snapshots',
  'cash_flow_projections',
  'audit_logs',
  'notification_logs',
  'compliance_checks',
  'automation_jobs',
  'business_rules',
  'digital_certificates',
  'webhook_configs',
  'tax_reform_rates',
  'tax_destination_rules',
  'fiscal_simulation_logs',
  'payment_customers',
  'subscriptions',
  'checkout_sessions',
  'payment_webhook_events',
] as const;

describe('PostgreSQL RLS policies', () => {
  const migrationSql = readFileSync(RLS_MIGRATION_PATH, 'utf8');
  const hardeningSql = readFileSync(RLS_HARDENING_MIGRATION_PATH, 'utf8');

  it('deve criar a funcao de contexto usando TEXT conforme schema Prisma atual', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION public.get_current_company_id()',
    );
    expect(migrationSql).toContain('RETURNS TEXT');
    expect(migrationSql).toContain(
      "current_setting('app.current_company_id', true)",
    );
  });

  it('deve habilitar RLS nas tabelas criticas de cliente', () => {
    const requiredTables = ['companies', ...COMPANY_SCOPED_RLS_TABLES];

    for (const tableName of requiredTables) {
      expect(migrationSql).toContain(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`,
      );
    }
  });

  it('deve restringir companies pelo proprio id da empresa', () => {
    expect(migrationSql).toContain(
      'CREATE POLICY companies_read_policy ON "companies"',
    );
    expect(migrationSql).toContain(
      'USING ("id" = public.get_current_company_id())',
    );
    expect(migrationSql).toContain(
      'WITH CHECK ("id" = public.get_current_company_id())',
    );
  });

  it('deve criar policies de leitura, criacao e atualizacao por companyId', () => {
    for (const tableName of COMPANY_SCOPED_RLS_TABLES) {
      expect(migrationSql).toContain(
        `CREATE POLICY ${tableName}_read_policy ON "${tableName}"`,
      );
      expect(migrationSql).toContain(
        `CREATE POLICY ${tableName}_insert_policy ON "${tableName}"`,
      );
      expect(migrationSql).toContain(
        `CREATE POLICY ${tableName}_update_policy ON "${tableName}"`,
      );
      expect(migrationSql).toContain(
        'USING ("companyId" = public.get_current_company_id())',
      );
      expect(migrationSql).toContain(
        'WITH CHECK ("companyId" = public.get_current_company_id())',
      );
    }
  });

  it('nao deve liberar delete fisico por policy RLS nesta sprint', () => {
    expect(migrationSql).not.toMatch(/FOR\s+DELETE/i);
  });

  it('deve forcar RLS em todas as tabelas com escopo de empresa', () => {
    for (const tableName of HARDENED_RLS_TABLES) {
      expect(hardeningSql).toContain(
        `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(hardeningSql).toContain(
        `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY;`,
      );
    }
  });

  it('deve garantir role de runtime sem BYPASSRLS', () => {
    expect(hardeningSql).toContain('CREATE ROLE bcost_app LOGIN NOBYPASSRLS');
    expect(hardeningSql).toContain('ALTER ROLE bcost_app NOBYPASSRLS');
  });

  it('deve remover policies antigas de delete fisico em tabelas fiscais', () => {
    const deletedPolicyNames = [
      'invoices_delete_policy',
      'bank_transactions_delete_policy',
      'payrolls_delete_policy',
      'tax_calculations_delete_policy',
      'tax_obligations_delete_policy',
      'fiscal_obligations_delete_policy',
      'accounting_entries_delete_policy',
      'financial_events_delete_policy',
    ] as const;

    for (const policyName of deletedPolicyNames) {
      expect(hardeningSql).toContain(
        `DROP POLICY IF EXISTS "${policyName}"`,
      );
    }
  });

  it('deve proteger tabelas sensiveis que estavam fora da cobertura inicial', () => {
    const sensitiveTables = [
      'digital_certificates',
      'webhook_configs',
      'audit_logs',
      'company_users',
      'subscriptions',
      'checkout_sessions',
      'payment_webhook_events',
    ] as const;

    for (const tableName of sensitiveTables) {
      expect(hardeningSql).toContain(
        `CREATE POLICY ${tableName}_read_policy ON "${tableName}"`,
      );
      expect(hardeningSql).toContain(
        `CREATE POLICY ${tableName}_insert_policy ON "${tableName}"`,
      );
      expect(hardeningSql).toContain(
        `CREATE POLICY ${tableName}_update_policy ON "${tableName}"`,
      );
    }
  });
});

describe('PrismaService RLS context helpers', () => {
  let service: PrismaService;
  let moduleRef: TestingModule;

  type ExecuteRawTaggedCall = [TemplateStringsArray, string, boolean];
  type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

  const mockConfigService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://user:password@localhost:5432/testdb?schema=public';
      }

      throw new Error(`Config key ${key} not found`);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = moduleRef.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.restoreAllMocks();
  });

  it('deve sincronizar TenantContext e variavel de sessao PostgreSQL', async () => {
    const companyId = 'company-rls-001';
    const queryRawSpy = jest
      .spyOn(service, '$queryRaw')
      .mockResolvedValueOnce([{ set_config: companyId }]);

    await TenantContext.run({}, async () => {
      await service.setRlsCompanyContext(companyId);

      expect(TenantContext.getTenantId()).toBe(companyId);
    });

    expect(queryRawSpy).toHaveBeenCalledTimes(1);
  });

  it('deve limpar TenantContext e variavel de sessao PostgreSQL', async () => {
    const queryRawSpy = jest
      .spyOn(service, '$queryRaw')
      .mockResolvedValueOnce([{ set_config: '' }]);

    await TenantContext.run({ tenantId: 'company-rls-002' }, async () => {
      await service.clearRlsCompanyContext();

      expect(TenantContext.getTenantId()).toBeUndefined();
    });

    expect(queryRawSpy).toHaveBeenCalledTimes(1);
  });

  it('deve executar operacoes RLS em transacao com contexto local', async () => {
    const companyId = ' company-rls-003 ';
    const normalizedCompanyId = 'company-rls-003';
    const executeRawSpy = jest
      .fn<Promise<number>, ExecuteRawTaggedCall>()
      .mockResolvedValue(1);
    const transactionClient = {
      $executeRaw: executeRawSpy,
    } as unknown as Prisma.TransactionClient;
    const transactionSpy = jest.spyOn(service, '$transaction');

    transactionSpy.mockImplementation(
      (async (input: unknown) => {
        if (typeof input !== 'function') {
          throw new Error('Expected an interactive transaction callback.');
        }

        return (input as TransactionCallback<string>)(transactionClient);
      }) as typeof service.$transaction,
    );

    const result = await service.withRlsCompanyContext(companyId, async (tx) => {
      expect(tx).toBe(transactionClient);
      return 'rls-ok';
    });

    expect(result).toBe('rls-ok');
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(executeRawSpy).toHaveBeenCalledTimes(1);

    const [sqlTemplate, companyIdParam] = executeRawSpy.mock
      .calls[0] as ExecuteRawTaggedCall;
    const sqlText = sqlTemplate.join('');

    expect(sqlText).toContain("set_config('app.current_company_id'");
    expect(sqlText).toContain('true');
    expect(companyIdParam).toBe(normalizedCompanyId);
  });

  it('deve bloquear transacao RLS sem companyId valido', async () => {
    const transactionSpy = jest.spyOn(service, '$transaction');

    await expect(
      service.withRlsCompanyContext('   ', async () => 'never-runs'),
    ).rejects.toThrow('companyId is required');

    expect(transactionSpy).not.toHaveBeenCalled();
  });
});
