-- Sprint 0 / Item 1: RLS DELETE Policies
-- Adiciona proteção DELETE para todas as tabelas com isolamento multi-tenant.
-- Sem essas policies, DELETE statements não são bloqueados por RLS.

CREATE POLICY "companies_delete_policy" ON "companies"
  FOR DELETE
  USING ("id" = public.get_current_company_id());

CREATE POLICY "invoices_delete_policy" ON "invoices"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "bank_transactions_delete_policy" ON "bank_transactions"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "employees_delete_policy" ON "employees"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "payrolls_delete_policy" ON "payrolls"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "tax_calculations_delete_policy" ON "tax_calculations"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "tax_obligations_delete_policy" ON "tax_obligations"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "fiscal_obligations_delete_policy" ON "fiscal_obligations"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "accounting_entries_delete_policy" ON "accounting_entries"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "contracts_delete_policy" ON "contracts"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "customers_delete_policy" ON "customers"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "financial_events_delete_policy" ON "financial_events"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());

CREATE POLICY "bank_accounts_delete_policy" ON "bank_accounts"
  FOR DELETE
  USING ("companyId" = public.get_current_company_id());
