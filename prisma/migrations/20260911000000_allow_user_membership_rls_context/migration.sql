-- Permite que a aplicacao leia os vinculos do proprio usuario durante
-- autenticacao/hidratacao de sessao antes de existir uma empresa ativa.
-- Nao concede acesso cruzado: leitura por userId usa app.current_user_id;
-- demais operacoes continuam escopadas por app.current_company_id.

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  current_user_id TEXT;
BEGIN
  current_user_id := current_setting('app.current_user_id', true);

  IF current_user_id IS NULL OR current_user_id = '' THEN
    RETURN NULL;
  END IF;

  RETURN current_user_id;
END;
$$;

DROP POLICY IF EXISTS company_users_read_policy ON "company_users";
CREATE POLICY company_users_read_policy ON "company_users"
  FOR SELECT
  USING (
    "companyId" = public.get_current_company_id()
    OR "userId" = public.get_current_user_id()
  );
