CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAGARME', 'MERCADO_PAGO');

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'INCOMPLETE',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'UNPAID',
  'CANCELED',
  'PAUSED'
);

CREATE TYPE "CheckoutSessionStatus" AS ENUM (
  'CREATED',
  'OPEN',
  'COMPLETE',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED'
);

CREATE TABLE "payment_customers" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "providerCustomerId" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "paymentCustomerId" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "providerSubscriptionId" TEXT NOT NULL,
  "providerCustomerId" TEXT,
  "planLevel" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_sessions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "paymentCustomerId" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "providerCheckoutSessionId" TEXT NOT NULL,
  "planLevel" TEXT NOT NULL,
  "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'CREATED',
  "checkoutUrl" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_customers_companyId_provider_key" ON "payment_customers"("companyId", "provider");
CREATE UNIQUE INDEX "payment_customers_provider_providerCustomerId_key" ON "payment_customers"("provider", "providerCustomerId");
CREATE INDEX "payment_customers_companyId_idx" ON "payment_customers"("companyId");

CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");
CREATE INDEX "subscriptions_companyId_status_idx" ON "subscriptions"("companyId", "status");
CREATE INDEX "subscriptions_provider_providerCustomerId_idx" ON "subscriptions"("provider", "providerCustomerId");

CREATE UNIQUE INDEX "checkout_sessions_providerCheckoutSessionId_key" ON "checkout_sessions"("providerCheckoutSessionId");
CREATE INDEX "checkout_sessions_companyId_status_idx" ON "checkout_sessions"("companyId", "status");
CREATE INDEX "checkout_sessions_provider_planLevel_idx" ON "checkout_sessions"("provider", "planLevel");

CREATE UNIQUE INDEX "payment_webhook_events_provider_providerEventId_key" ON "payment_webhook_events"("provider", "providerEventId");
CREATE INDEX "payment_webhook_events_companyId_eventType_idx" ON "payment_webhook_events"("companyId", "eventType");
CREATE INDEX "payment_webhook_events_provider_status_idx" ON "payment_webhook_events"("provider", "status");

ALTER TABLE "payment_customers"
  ADD CONSTRAINT "payment_customers_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_paymentCustomerId_fkey"
  FOREIGN KEY ("paymentCustomerId") REFERENCES "payment_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "checkout_sessions"
  ADD CONSTRAINT "checkout_sessions_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkout_sessions"
  ADD CONSTRAINT "checkout_sessions_paymentCustomerId_fkey"
  FOREIGN KEY ("paymentCustomerId") REFERENCES "payment_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "payment_webhook_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
