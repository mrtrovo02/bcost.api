-- =========================================================
-- bCost | Fix schema drift - bank_accounts.deletedAt
-- =========================================================

ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_deleted_at
ON public.bank_accounts ("companyId", "deletedAt");
