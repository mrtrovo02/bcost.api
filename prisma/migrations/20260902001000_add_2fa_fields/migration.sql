-- Sprint 0 / Item 2: TOTP 2FA fields
-- Armazena secret em estado pending ate confirmacao via OTP.
-- Backup codes devem ser persistidos como hashes, nunca em texto puro.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorPending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "users_two_factor_idx"
  ON "users" ("twoFactor", "twoFactorPending");
