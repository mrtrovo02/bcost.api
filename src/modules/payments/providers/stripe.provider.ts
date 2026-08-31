'use strict';

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CheckoutSessionRequest,
  CheckoutSessionResult,
  BillingPortalSessionRequest,
  BillingPortalSessionResult,
  MonetizablePlanLevel,
  PaymentProviderAdapter,
  PaymentProviderWebhookEvent,
  ProviderSubscriptionSnapshot,
  ProviderSubscriptionStatus,
} from '../domain/payment-provider.types.js';

type StripeObjectRecord = Record<string, unknown>;

type StripeApiResponse = StripeObjectRecord & {
  id?: string;
  object?: string;
  url?: string | null;
  status?: string;
  customer?: string | StripeObjectRecord | null;
  subscription?: string | StripeObjectRecord | null;
  expires_at?: number | null;
};

@Injectable()
export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly provider = 'STRIPE' as const;
  private readonly apiBaseUrl = 'https://api.stripe.com/v1';

  constructor(private readonly config: ConfigService) {}

  async createCheckoutSession(
    input: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResult> {
    const secretKey = this.requireSecretKey();
    const priceId = this.requirePriceId(input.planLevel);
    const form = new URLSearchParams();

    form.set('mode', 'subscription');
    form.set('success_url', input.successUrl);
    form.set('cancel_url', input.cancelUrl);
    form.set('client_reference_id', input.companyId);
    form.set('line_items[0][price]', priceId);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[companyId]', input.companyId);
    form.set('metadata[planLevel]', input.planLevel);
    form.set('subscription_data[metadata][companyId]', input.companyId);
    form.set('subscription_data[metadata][planLevel]', input.planLevel);

    if (input.providerCustomerId) {
      form.set('customer', input.providerCustomerId);
    } else if (input.customerEmail) {
      form.set('customer_email', input.customerEmail);
    }

    const response = await fetch(`${this.apiBaseUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    const body = (await response.json()) as StripeApiResponse;

    if (!response.ok) {
      const message = this.resolveStripeErrorMessage(body);
      throw new BadRequestException(`Stripe checkout recusado: ${message}`);
    }

    if (typeof body.id !== 'string' || typeof body.url !== 'string') {
      throw new ServiceUnavailableException(
        'Stripe não retornou uma sessão de checkout válida.',
      );
    }

    return {
      provider: this.provider,
      providerCheckoutSessionId: body.id,
      providerCustomerId: this.extractStripeId(body.customer),
      providerSubscriptionId: this.extractStripeId(body.subscription),
      checkoutUrl: body.url,
      status: typeof body.status === 'string' ? body.status : 'open',
      expiresAt:
        typeof body.expires_at === 'number'
          ? new Date(body.expires_at * 1000)
          : null,
    };
  }

  async createBillingPortalSession(
    input: BillingPortalSessionRequest,
  ): Promise<BillingPortalSessionResult> {
    const secretKey = this.requireSecretKey();
    const form = new URLSearchParams();

    form.set('customer', input.providerCustomerId);
    form.set('return_url', input.returnUrl);

    const response = await fetch(`${this.apiBaseUrl}/billing_portal/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    const body = (await response.json()) as StripeApiResponse;

    if (!response.ok) {
      const message = this.resolveStripeErrorMessage(body);
      throw new BadRequestException(`Stripe portal recusado: ${message}`);
    }

    if (typeof body.id !== 'string' || typeof body.url !== 'string') {
      throw new ServiceUnavailableException(
        'Stripe não retornou uma sessão de portal válida.',
      );
    }

    return {
      provider: this.provider,
      providerPortalSessionId: body.id,
      portalUrl: body.url,
    };
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signatureHeader?: string,
  ): PaymentProviderWebhookEvent {
    this.verifyWebhookSignature(rawBody, signatureHeader);

    const payload = JSON.parse(rawBody.toString('utf8')) as StripeObjectRecord;
    const providerEventId = this.requireString(payload.id, 'id');
    const eventType = this.requireString(payload.type, 'type');
    const data = this.toRecord(payload.data);
    const object = this.toRecord(data.object);

    if (eventType.startsWith('checkout.session.')) {
      return this.toCheckoutWebhookEvent(
        providerEventId,
        eventType,
        payload,
        object,
      );
    }

    if (eventType.startsWith('customer.subscription.')) {
      const subscription = this.toSubscriptionSnapshot(object);
      return {
        provider: this.provider,
        providerEventId,
        eventType,
        companyId: subscription.companyId,
        payload,
        providerSubscriptionId: subscription.providerSubscriptionId,
        subscription,
      };
    }

    return {
      provider: this.provider,
      providerEventId,
      eventType,
      payload,
    };
  }

  private toCheckoutWebhookEvent(
    providerEventId: string,
    eventType: string,
    payload: StripeObjectRecord,
    object: StripeObjectRecord,
  ): PaymentProviderWebhookEvent {
    const metadata = this.readMetadata(object.metadata);
    const status = this.mapCheckoutStatus(
      typeof object.status === 'string' ? object.status : undefined,
    );

    return {
      provider: this.provider,
      providerEventId,
      eventType,
      companyId:
        metadata.companyId ??
        this.optionalString(object.client_reference_id) ??
        null,
      payload,
      checkoutSessionId: this.optionalString(object.id),
      checkoutStatus: status,
      providerSubscriptionId: this.extractStripeId(object.subscription),
    };
  }

  private toSubscriptionSnapshot(
    object: StripeObjectRecord,
  ): ProviderSubscriptionSnapshot {
    const metadata = this.readMetadata(object.metadata);

    return {
      provider: this.provider,
      providerSubscriptionId: this.requireString(object.id, 'subscription.id'),
      providerCustomerId: this.extractStripeId(object.customer),
      companyId: metadata.companyId ?? null,
      planLevel: this.toPlanLevel(metadata.planLevel),
      status: this.mapSubscriptionStatus(
        typeof object.status === 'string' ? object.status : undefined,
      ),
      currentPeriodStart: this.unixToDate(object.current_period_start),
      currentPeriodEnd: this.unixToDate(object.current_period_end),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      canceledAt: this.unixToDate(object.canceled_at),
      trialEndsAt: this.unixToDate(object.trial_end),
      metadata,
    };
  }

  private verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader?: string,
  ): void {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!secret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET não configurado no servidor.',
      );
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Assinatura Stripe ausente.');
    }

    const parts = signatureHeader.split(',').map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
    const signatures = parts
      .filter((part) => part.startsWith('v1='))
      .map((part) => part.slice(3));

    if (!timestamp || signatures.length === 0) {
      throw new UnauthorizedException('Assinatura Stripe inválida.');
    }

    const timestampSeconds = Number(timestamp);
    const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);

    if (!Number.isFinite(timestampSeconds) || ageSeconds > 300) {
      throw new UnauthorizedException('Assinatura Stripe expirada.');
    }

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const verified = signatures.some((signature) => {
      const actualBuffer = Buffer.from(signature);

      return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      );
    });

    if (!verified) {
      throw new UnauthorizedException('Assinatura Stripe não confere.');
    }
  }

  private requireSecretKey(): string {
    const value = this.config.get<string>('STRIPE_SECRET_KEY');

    if (!value) {
      throw new ServiceUnavailableException(
        'STRIPE_SECRET_KEY não configurada no servidor.',
      );
    }

    return value;
  }

  private requirePriceId(planLevel: MonetizablePlanLevel): string {
    const envKey =
      planLevel === 'PRO' ? 'STRIPE_PRICE_PRO' : 'STRIPE_PRICE_ENTERPRISE';
    const value = this.config.get<string>(envKey);

    if (!value) {
      throw new ServiceUnavailableException(
        `${envKey} não configurado para checkout.`,
      );
    }

    return value;
  }

  private resolveStripeErrorMessage(body: StripeObjectRecord): string {
    const error = this.toRecord(body.error);
    const message = error.message;

    return typeof message === 'string'
      ? message
      : 'erro não detalhado pelo gateway';
  }

  private mapCheckoutStatus(
    status?: string,
  ): 'OPEN' | 'COMPLETE' | 'EXPIRED' | 'FAILED' {
    if (status === 'complete') return 'COMPLETE';
    if (status === 'expired') return 'EXPIRED';
    if (status === 'open') return 'OPEN';
    return 'FAILED';
  }

  private mapSubscriptionStatus(status?: string): ProviderSubscriptionStatus {
    if (status === 'trialing') return 'TRIALING';
    if (status === 'active') return 'ACTIVE';
    if (status === 'past_due') return 'PAST_DUE';
    if (status === 'unpaid') return 'UNPAID';
    if (status === 'canceled') return 'CANCELED';
    if (status === 'paused') return 'PAUSED';
    return 'INCOMPLETE';
  }

  private readMetadata(value: unknown): Record<string, string> {
    const record = this.toRecord(value);
    const output: Record<string, string> = {};

    for (const [key, item] of Object.entries(record)) {
      if (typeof item === 'string') output[key] = item;
    }

    return output;
  }

  private toPlanLevel(value?: string): MonetizablePlanLevel | null {
    if (value === 'PRO' || value === 'ENTERPRISE') return value;
    return null;
  }

  private unixToDate(value: unknown): Date | null {
    return typeof value === 'number' ? new Date(value * 1000) : null;
  }

  private extractStripeId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    const record = this.toRecord(value);
    return this.optionalString(record.id);
  }

  private optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private requireString(value: unknown, field: string): string {
    const resolved = this.optionalString(value);

    if (!resolved) {
      throw new BadRequestException(`Payload Stripe sem campo ${field}.`);
    }

    return resolved;
  }

  private toRecord(value: unknown): StripeObjectRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as StripeObjectRecord)
      : {};
  }
}
