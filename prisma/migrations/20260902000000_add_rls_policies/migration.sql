-- Sprint 0 / Item 1: PostgreSQL Row-Level Security
-- Objetivo: adicionar isolamento defensivo por empresa diretamente no banco.
--
-- Observacao de schema:
-- O Prisma deste projeto usa ids String e colunas camelCase ("companyId").
-- Por isso a funcao retorna TEXT e as policies usam "companyId", nao UUID/company_id.

CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_company_id TEXT;
BEGIN
  current_company_id := current_setting('app.current_company_id', true);

  IF current_company_id IS NULL OR btrim(current_company_id) = '' THEN
    RETURN NULL;
  END IF;

  RETURN current_company_id;
END;
$$;

COMMENT ON FUNCTION public.get_current_company_id()
IS 'Retorna o companyId ativo configurado na sessao PostgreSQL para policies RLS da bCost.';

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payrolls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_calculations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_read_policy ON "companies";
DROP POLICY IF EXISTS companies_insert_policy ON "companies";
DROP POLICY IF EXISTS companies_update_policy ON "companies";
CREATE POLICY companies_read_policy ON "companies"
  FOR SELECT
  USING ("id" = public.get_current_company_id());
CREATE POLICY companies_insert_policy ON "companies"
  FOR INSERT
  WITH CHECK ("id" = public.get_current_company_id());
CREATE POLICY companies_update_policy ON "companies"
  FOR UPDATE
  USING ("id" = public.get_current_company_id())
  WITH CHECK ("id" = public.get_current_company_id());

DROP POLICY IF EXISTS invoices_read_policy ON "invoices";
DROP POLICY IF EXISTS invoices_insert_policy ON "invoices";
DROP POLICY IF EXISTS invoices_update_policy ON "invoices";
CREATE POLICY invoices_read_policy ON "invoices"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY invoices_insert_policy ON "invoices"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY invoices_update_policy ON "invoices"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS bank_transactions_read_policy ON "bank_transactions";
DROP POLICY IF EXISTS bank_transactions_insert_policy ON "bank_transactions";
DROP POLICY IF EXISTS bank_transactions_update_policy ON "bank_transactions";
CREATE POLICY bank_transactions_read_policy ON "bank_transactions"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY bank_transactions_insert_policy ON "bank_transactions"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY bank_transactions_update_policy ON "bank_transactions"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS employees_read_policy ON "employees";
DROP POLICY IF EXISTS employees_insert_policy ON "employees";
DROP POLICY IF EXISTS employees_update_policy ON "employees";
CREATE POLICY employees_read_policy ON "employees"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY employees_insert_policy ON "employees"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY employees_update_policy ON "employees"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS payrolls_read_policy ON "payrolls";
DROP POLICY IF EXISTS payrolls_insert_policy ON "payrolls";
DROP POLICY IF EXISTS payrolls_update_policy ON "payrolls";
CREATE POLICY payrolls_read_policy ON "payrolls"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY payrolls_insert_policy ON "payrolls"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY payrolls_update_policy ON "payrolls"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS tax_calculations_read_policy ON "tax_calculations";
DROP POLICY IF EXISTS tax_calculations_insert_policy ON "tax_calculations";
DROP POLICY IF EXISTS tax_calculations_update_policy ON "tax_calculations";
CREATE POLICY tax_calculations_read_policy ON "tax_calculations"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY tax_calculations_insert_policy ON "tax_calculations"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY tax_calculations_update_policy ON "tax_calculations"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS tax_obligations_read_policy ON "tax_obligations";
DROP POLICY IF EXISTS tax_obligations_insert_policy ON "tax_obligations";
DROP POLICY IF EXISTS tax_obligations_update_policy ON "tax_obligations";
CREATE POLICY tax_obligations_read_policy ON "tax_obligations"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY tax_obligations_insert_policy ON "tax_obligations"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY tax_obligations_update_policy ON "tax_obligations"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS fiscal_obligations_read_policy ON "fiscal_obligations";
DROP POLICY IF EXISTS fiscal_obligations_insert_policy ON "fiscal_obligations";
DROP POLICY IF EXISTS fiscal_obligations_update_policy ON "fiscal_obligations";
CREATE POLICY fiscal_obligations_read_policy ON "fiscal_obligations"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY fiscal_obligations_insert_policy ON "fiscal_obligations"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY fiscal_obligations_update_policy ON "fiscal_obligations"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS accounting_entries_read_policy ON "accounting_entries";
DROP POLICY IF EXISTS accounting_entries_insert_policy ON "accounting_entries";
DROP POLICY IF EXISTS accounting_entries_update_policy ON "accounting_entries";
CREATE POLICY accounting_entries_read_policy ON "accounting_entries"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY accounting_entries_insert_policy ON "accounting_entries"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY accounting_entries_update_policy ON "accounting_entries"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS contracts_read_policy ON "contracts";
DROP POLICY IF EXISTS contracts_insert_policy ON "contracts";
DROP POLICY IF EXISTS contracts_update_policy ON "contracts";
CREATE POLICY contracts_read_policy ON "contracts"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY contracts_insert_policy ON "contracts"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY contracts_update_policy ON "contracts"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS customers_read_policy ON "customers";
DROP POLICY IF EXISTS customers_insert_policy ON "customers";
DROP POLICY IF EXISTS customers_update_policy ON "customers";
CREATE POLICY customers_read_policy ON "customers"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY customers_insert_policy ON "customers"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY customers_update_policy ON "customers"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());

DROP POLICY IF EXISTS financial_events_read_policy ON "financial_events";
DROP POLICY IF EXISTS financial_events_insert_policy ON "financial_events";
DROP POLICY IF EXISTS financial_events_update_policy ON "financial_events";
CREATE POLICY financial_events_read_policy ON "financial_events"
  FOR SELECT
  USING ("companyId" = public.get_current_company_id());
CREATE POLICY financial_events_insert_policy ON "financial_events"
  FOR INSERT
  WITH CHECK ("companyId" = public.get_current_company_id());
CREATE POLICY financial_events_update_policy ON "financial_events"
  FOR UPDATE
  USING ("companyId" = public.get_current_company_id())
  WITH CHECK ("companyId" = public.get_current_company_id());
