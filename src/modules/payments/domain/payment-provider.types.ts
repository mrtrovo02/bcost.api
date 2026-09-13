'use strict';

export type PaymentProviderCode = 'STRIPE';

export type MonetizablePlanLevel = 'PRO' | 'ENTERPRISE';

export type CheckoutSessionRequest = {
  companyId: string;
  planLevel: MonetizablePlanLevel;
  customerEmail?: string | null;
  customerName?: string | null;
  providerCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionResult = {
  provider: PaymentProviderCode;
  providerCheckoutSessionId: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  checkoutUrl: string;
  status: string;
  expiresAt?: Date | null;
};

export type BillingPortalSessionRequest = {
  providerCustomerId: string;
  returnUrl: string;
};

export type BillingPortalSessionResult = {
  provider: PaymentProviderCode;
  providerPortalSessionId: string;
  portalUrl: string;
};

export type ProviderSubscriptionStatus =
  | 'INCOMPLETE'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'UNPAID'
  | 'CANCELED'
  | 'PAUSED';

export type ProviderSubscriptionSnapshot = {
  provider: PaymentProviderCode;
  providerSubscriptionId: string;
  providerCustomerId?: string | null;
  companyId?: string | null;
  planLevel?: MonetizablePlanLevel | null;
  status: ProviderSubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
  trialEndsAt?: Date | null;
  metadata: Record<string, string>;
};

export type PaymentProviderWebhookEvent = {
  provider: PaymentProviderCode;
  providerEventId: string;
  eventType: string;
  companyId?: string | null;
  payload: Record<string, unknown>;
  checkoutSessionId?: string | null;
  checkoutStatus?: 'OPEN' | 'COMPLETE' | 'EXPIRED' | 'FAILED' | null;
  providerSubscriptionId?: string | null;
  subscription?: ProviderSubscriptionSnapshot | null;
};

export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderCode;
  createCheckoutSession(
    input: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResult>;
  createBillingPortalSession(
    input: BillingPortalSessionRequest,
  ): Promise<BillingPortalSessionResult>;
  constructWebhookEvent(
    rawBody: Buffer,
    signatureHeader?: string,
  ): PaymentProviderWebhookEvent;
}
