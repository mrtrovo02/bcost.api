-- Permite hidratar dados basicos da empresa durante autenticacao quando
-- app.current_user_id identifica um usuario vinculado a ela. Mantem a
-- politica original por app.current_company_id para operacao escopada.

DROP POLICY IF EXISTS companies_read_policy ON "companies";
CREATE POLICY companies_read_policy ON "companies"
  FOR SELECT
  USING (
    "id" = public.get_current_company_id()
    OR EXISTS (
      SELECT 1
      FROM "company_users"
      WHERE "company_users"."companyId" = "companies"."id"
        AND "company_users"."userId" = public.get_current_user_id()
        AND "company_users"."deletedAt" IS NULL
    )
  );
