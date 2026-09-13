-- Sprint 0 / Item 3: Token Blacklist & Logout
-- Permite revogacao imediata de JWTs emitidos pela API bCost.

CREATE TABLE IF NOT EXISTS "token_blacklist" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "jti" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "token_blacklist_user_fk"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "token_blacklist_expires_at_idx"
  ON "token_blacklist" ("expiresAt");

CREATE INDEX IF NOT EXISTS "token_blacklist_jti_idx"
  ON "token_blacklist" ("jti");
