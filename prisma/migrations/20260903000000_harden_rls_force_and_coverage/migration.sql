-- Sprint 0 / Item 1 hardening: RLS real para ambiente enterprise.
-- Objetivos:
-- 1. Forcar RLS inclusive para o owner da tabela.
-- 2. Cobrir todas as tabelas com escopo por empresa no schema atual.
-- 3. Remover policies de DELETE fisico; o produto fiscal deve preservar historico
--    e usar soft-delete/trilha auditavel na camada de aplicacao.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bcost_app') THEN
    CREATE ROLE bcost_app LOGIN NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE bcost_app NOBYPASSRLS;
COMMENT ON ROLE bcost_app IS 'Role de runtime da aplicacao bCost, sem BYPASSRLS. Configure DATABASE_URL de producao com esta role apos conceder privilegios minimos.';

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "company_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_sefaz_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_sefaz_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "bank_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_transactions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "balance_locks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "balance_locks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tax_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_obligations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tax_calculations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_calculations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_obligations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payrolls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payrolls" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payroll_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "account_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "accounting_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "financial_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "financial_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cash_flow_projections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_flow_projections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "compliance_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_checks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "automation_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_jobs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "business_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "digital_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_certificates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_configs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tax_reform_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_reform_rates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tax_destination_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_destination_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_simulation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_simulation_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_customers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "checkout_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_webhook_events" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_delete_policy" ON "companies";
DROP POLICY IF EXISTS "invoices_delete_policy" ON "invoices";
DROP POLICY IF EXISTS "bank_transactions_delete_policy" ON "bank_transactions";
DROP POLICY IF EXISTS "employees_delete_policy" ON "employees";
DROP POLICY IF EXISTS "payrolls_delete_policy" ON "payrolls";
DROP POLICY IF EXISTS "tax_calculations_delete_policy" ON "tax_calculations";
DROP POLICY IF EXISTS "tax_obligations_delete_policy" ON "tax_obligations";
DROP POLICY IF EXISTS "fiscal_obligations_delete_policy" ON "fiscal_obligations";
DROP POLICY IF EXISTS "accounting_entries_delete_policy" ON "accounting_entries";
DROP POLICY IF EXISTS "contracts_delete_policy" ON "contracts";
DROP POLICY IF EXISTS "customers_delete_policy" ON "customers";
DROP POLICY IF EXISTS "financial_events_delete_policy" ON "financial_events";
DROP POLICY IF EXISTS "bank_accounts_delete_policy" ON "bank_accounts";

DROP POLICY IF EXISTS company_users_read_policy ON "company_users";
DROP POLICY IF EXISTS company_users_insert_policy ON "company_users";
DROP POLICY IF EXISTS company_users_update_policy ON "company_users";
CREATE POLICY company_users_read_policy ON "company_users"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY company_users_insert_policy ON "company_users"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY company_users_update_policy ON "company_users"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS bank_accounts_read_policy ON "bank_accounts";
DROP POLICY IF EXISTS bank_accounts_insert_policy ON "bank_accounts";
DROP POLICY IF EXISTS bank_accounts_update_policy ON "bank_accounts";
CREATE POLICY bank_accounts_read_policy ON "bank_accounts"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY bank_accounts_insert_policy ON "bank_accounts"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY bank_accounts_update_policy ON "bank_accounts"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS balance_locks_read_policy ON "balance_locks";
DROP POLICY IF EXISTS balance_locks_insert_policy ON "balance_locks";
DROP POLICY IF EXISTS balance_locks_update_policy ON "balance_locks";
CREATE POLICY balance_locks_read_policy ON "balance_locks"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY balance_locks_insert_policy ON "balance_locks"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY balance_locks_update_policy ON "balance_locks"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS payroll_entries_read_policy ON "payroll_entries";
DROP POLICY IF EXISTS payroll_entries_insert_policy ON "payroll_entries";
DROP POLICY IF EXISTS payroll_entries_update_policy ON "payroll_entries";
CREATE POLICY payroll_entries_read_policy ON "payroll_entries"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "payrolls"
      WHERE "payrolls"."id" = "payroll_entries"."payrollId"
        AND "payrolls"."companyId" = public.get_current_company_id()
    )
  );
CREATE POLICY payroll_entries_insert_policy ON "payroll_entries"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "payrolls"
      WHERE "payrolls"."id" = "payroll_entries"."payrollId"
        AND "payrolls"."companyId" = public.get_current_company_id()
    )
  );
CREATE POLICY payroll_entries_update_policy ON "payroll_entries"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM "payrolls"
      WHERE "payrolls"."id" = "payroll_entries"."payrollId"
        AND "payrolls"."companyId" = public.get_current_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "payrolls"
      WHERE "payrolls"."id" = "payroll_entries"."payrollId"
        AND "payrolls"."companyId" = public.get_current_company_id()
    )
  );

DROP POLICY IF EXISTS invoice_sefaz_events_read_policy ON "invoice_sefaz_events";
DROP POLICY IF EXISTS invoice_sefaz_events_insert_policy ON "invoice_sefaz_events";
DROP POLICY IF EXISTS invoice_sefaz_events_update_policy ON "invoice_sefaz_events";
CREATE POLICY invoice_sefaz_events_read_policy ON "invoice_sefaz_events"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "invoices"
      WHERE "invoices"."id" = "invoice_sefaz_events"."invoiceId"
        AND "invoices"."companyId" = public.get_current_company_id()
    )
  );
CREATE POLICY invoice_sefaz_events_insert_policy ON "invoice_sefaz_events"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "invoices"
      WHERE "invoices"."id" = "invoice_sefaz_events"."invoiceId"
        AND "invoices"."companyId" = public.get_current_company_id()
    )
  );
CREATE POLICY invoice_sefaz_events_update_policy ON "invoice_sefaz_events"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM "invoices"
      WHERE "invoices"."id" = "invoice_sefaz_events"."invoiceId"
        AND "invoices"."companyId" = public.get_current_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "invoices"
      WHERE "invoices"."id" = "invoice_sefaz_events"."invoiceId"
        AND "invoices"."companyId" = public.get_current_company_id()
    )
  );

DROP POLICY IF EXISTS account_plans_read_policy ON "account_plans";
DROP POLICY IF EXISTS account_plans_insert_policy ON "account_plans";
DROP POLICY IF EXISTS account_plans_update_policy ON "account_plans";
CREATE POLICY account_plans_read_policy ON "account_plans"
  FOR SELECT
  USING ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY account_plans_insert_policy ON "account_plans"
  FOR INSERT
  WITH CHECK ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY account_plans_update_policy ON "account_plans"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS financial_snapshots_read_policy ON "financial_snapshots";
DROP POLICY IF EXISTS financial_snapshots_insert_policy ON "financial_snapshots";
DROP POLICY IF EXISTS financial_snapshots_update_policy ON "financial_snapshots";
CREATE POLICY financial_snapshots_read_policy ON "financial_snapshots"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY financial_snapshots_insert_policy ON "financial_snapshots"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY financial_snapshots_update_policy ON "financial_snapshots"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS cash_flow_projections_read_policy ON "cash_flow_projections";
DROP POLICY IF EXISTS cash_flow_projections_insert_policy ON "cash_flow_projections";
DROP POLICY IF EXISTS cash_flow_projections_update_policy ON "cash_flow_projections";
CREATE POLICY cash_flow_projections_read_policy ON "cash_flow_projections"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY cash_flow_projections_insert_policy ON "cash_flow_projections"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY cash_flow_projections_update_policy ON "cash_flow_projections"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS audit_logs_read_policy ON "audit_logs";
DROP POLICY IF EXISTS audit_logs_insert_policy ON "audit_logs";
DROP POLICY IF EXISTS audit_logs_update_policy ON "audit_logs";
CREATE POLICY audit_logs_read_policy ON "audit_logs"
  FOR SELECT
  USING ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY audit_logs_insert_policy ON "audit_logs"
  FOR INSERT
  WITH CHECK ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY audit_logs_update_policy ON "audit_logs"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS notification_logs_read_policy ON "notification_logs";
DROP POLICY IF EXISTS notification_logs_insert_policy ON "notification_logs";
DROP POLICY IF EXISTS notification_logs_update_policy ON "notification_logs";
CREATE POLICY notification_logs_read_policy ON "notification_logs"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY notification_logs_insert_policy ON "notification_logs"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY notification_logs_update_policy ON "notification_logs"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS compliance_checks_read_policy ON "compliance_checks";
DROP POLICY IF EXISTS compliance_checks_insert_policy ON "compliance_checks";
DROP POLICY IF EXISTS compliance_checks_update_policy ON "compliance_checks";
CREATE POLICY compliance_checks_read_policy ON "compliance_checks"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY compliance_checks_insert_policy ON "compliance_checks"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY compliance_checks_update_policy ON "compliance_checks"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS automation_jobs_read_policy ON "automation_jobs";
DROP POLICY IF EXISTS automation_jobs_insert_policy ON "automation_jobs";
DROP POLICY IF EXISTS automation_jobs_update_policy ON "automation_jobs";
CREATE POLICY automation_jobs_read_policy ON "automation_jobs"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY automation_jobs_insert_policy ON "automation_jobs"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY automation_jobs_update_policy ON "automation_jobs"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS business_rules_read_policy ON "business_rules";
DROP POLICY IF EXISTS business_rules_insert_policy ON "business_rules";
DROP POLICY IF EXISTS business_rules_update_policy ON "business_rules";
CREATE POLICY business_rules_read_policy ON "business_rules"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY business_rules_insert_policy ON "business_rules"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY business_rules_update_policy ON "business_rules"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS digital_certificates_read_policy ON "digital_certificates";
DROP POLICY IF EXISTS digital_certificates_insert_policy ON "digital_certificates";
DROP POLICY IF EXISTS digital_certificates_update_policy ON "digital_certificates";
CREATE POLICY digital_certificates_read_policy ON "digital_certificates"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY digital_certificates_insert_policy ON "digital_certificates"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY digital_certificates_update_policy ON "digital_certificates"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS webhook_configs_read_policy ON "webhook_configs";
DROP POLICY IF EXISTS webhook_configs_insert_policy ON "webhook_configs";
DROP POLICY IF EXISTS webhook_configs_update_policy ON "webhook_configs";
CREATE POLICY webhook_configs_read_policy ON "webhook_configs"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY webhook_configs_insert_policy ON "webhook_configs"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY webhook_configs_update_policy ON "webhook_configs"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS tax_reform_rates_read_policy ON "tax_reform_rates";
DROP POLICY IF EXISTS tax_reform_rates_insert_policy ON "tax_reform_rates";
DROP POLICY IF EXISTS tax_reform_rates_update_policy ON "tax_reform_rates";
CREATE POLICY tax_reform_rates_read_policy ON "tax_reform_rates"
  FOR SELECT
  USING ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY tax_reform_rates_insert_policy ON "tax_reform_rates"
  FOR INSERT
  WITH CHECK ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY tax_reform_rates_update_policy ON "tax_reform_rates"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS tax_destination_rules_read_policy ON "tax_destination_rules";
DROP POLICY IF EXISTS tax_destination_rules_insert_policy ON "tax_destination_rules";
DROP POLICY IF EXISTS tax_destination_rules_update_policy ON "tax_destination_rules";
CREATE POLICY tax_destination_rules_read_policy ON "tax_destination_rules"
  FOR SELECT
  USING ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY tax_destination_rules_insert_policy ON "tax_destination_rules"
  FOR INSERT
  WITH CHECK ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY tax_destination_rules_update_policy ON "tax_destination_rules"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS fiscal_simulation_logs_read_policy ON "fiscal_simulation_logs";
DROP POLICY IF EXISTS fiscal_simulation_logs_insert_policy ON "fiscal_simulation_logs";
DROP POLICY IF EXISTS fiscal_simulation_logs_update_policy ON "fiscal_simulation_logs";
CREATE POLICY fiscal_simulation_logs_read_policy ON "fiscal_simulation_logs"
  FOR SELECT
  USING ("company_id" IS NULL OR "company_id" = public.get_current_company_id());
CREATE POLICY fiscal_simulation_logs_insert_policy ON "fiscal_simulation_logs"
  FOR INSERT
  WITH CHECK ("company_id" IS NULL OR "company_id" = public.get_current_company_id());
CREATE POLICY fiscal_simulation_logs_update_policy ON "fiscal_simulation_logs"
  FOR UPDATE
  USING ("company_id" = public.get_current_company_id())
  WITH CHECK ("company_id" = public.get_current_company_id());

DROP POLICY IF EXISTS payment_customers_read_policy ON "payment_customers";
DROP POLICY IF EXISTS payment_customers_insert_policy ON "payment_customers";
DROP POLICY IF EXISTS payment_customers_update_policy ON "payment_customers";
CREATE POLICY payment_customers_read_policy ON "payment_customers"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY payment_customers_insert_policy ON "payment_customers"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY payment_customers_update_policy ON "payment_customers"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS subscriptions_read_policy ON "subscriptions";
DROP POLICY IF EXISTS subscriptions_insert_policy ON "subscriptions";
DROP POLICY IF EXISTS subscriptions_update_policy ON "subscriptions";
CREATE POLICY subscriptions_read_policy ON "subscriptions"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY subscriptions_insert_policy ON "subscriptions"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY subscriptions_update_policy ON "subscriptions"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS checkout_sessions_read_policy ON "checkout_sessions";
DROP POLICY IF EXISTS checkout_sessions_insert_policy ON "checkout_sessions";
DROP POLICY IF EXISTS checkout_sessions_update_policy ON "checkout_sessions";
CREATE POLICY checkout_sessions_read_policy ON "checkout_sessions"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY checkout_sessions_insert_policy ON "checkout_sessions"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY checkout_sessions_update_policy ON "checkout_sessions"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS payment_webhook_events_read_policy ON "payment_webhook_events";
DROP POLICY IF EXISTS payment_webhook_events_insert_policy ON "payment_webhook_events";
DROP POLICY IF EXISTS payment_webhook_events_update_policy ON "payment_webhook_events";
CREATE POLICY payment_webhook_events_read_policy ON "payment_webhook_events"
  FOR SELECT
  USING ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY payment_webhook_events_insert_policy ON "payment_webhook_events"
  FOR INSERT
  WITH CHECK ("companyId" IS NULL OR "companyId" = public.get_current_company_id());
CREATE POLICY payment_webhook_events_update_policy ON "payment_webhook_events"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());
