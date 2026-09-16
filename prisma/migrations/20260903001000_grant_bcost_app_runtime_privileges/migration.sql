-- Sprint 0 / Item 1 hardening: privilegios minimos para a role de runtime.
-- A role bcost_app deve conseguir operar a aplicacao sem BYPASSRLS e sem ser dona
-- das tabelas. DELETE fisico nao e concedido; remocoes seguem via soft-delete.

GRANT USAGE ON SCHEMA public TO bcost_app;
GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO bcost_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  "companies",
  "company_users",
  "invoices",
  "invoice_sefaz_events",
  "bank_transactions",
  "bank_accounts",
  "balance_locks",
  "customers",
  "contracts",
  "tax_obligations",
  "tax_calculations",
  "fiscal_obligations",
  "employees",
  "payrolls",
  "payroll_entries",
  "account_plans",
  "accounting_entries",
  "financial_events",
  "financial_snapshots",
  "cash_flow_projections",
  "audit_logs",
  "notification_logs",
  "compliance_checks",
  "automation_jobs",
  "business_rules",
  "digital_certificates",
  "webhook_configs",
  "tax_reform_rates",
  "tax_destination_rules",
  "fiscal_simulation_logs",
  "payment_customers",
  "subscriptions",
  "checkout_sessions",
  "payment_webhook_events"
TO bcost_app;

GRANT SELECT ON TABLE
  "users",
  "tax_classifications",
  "token_blacklist",
  "user_sessions"
TO bcost_app;

GRANT INSERT, UPDATE ON TABLE
  "token_blacklist",
  "user_sessions"
TO bcost_app;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO bcost_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO bcost_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO bcost_app;
