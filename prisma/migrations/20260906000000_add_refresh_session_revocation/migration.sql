ALTER TABLE "user_sessions"
ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "user_sessions_userId_revokedAt_idx"
ON "user_sessions"("userId", "revokedAt");
