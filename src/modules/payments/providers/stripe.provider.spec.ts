import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { StripePaymentProvider } from './stripe.provider.js';

type MockConfig = {
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
};

function createConfig(values: MockConfig): ConfigService {
  return {
    get: <T = string>(key: string): T | undefined =>
      values[key as keyof MockConfig] as T,
  } as ConfigService;
}

function signPayload(
  payload: Buffer,
  secret: string,
  timestamp: number,
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload.toString('utf8')}`)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

describe('StripePaymentProvider', () => {
  const webhookSecret = 'whsec_test_secret';

  it('verifica assinatura e normaliza evento de assinatura Stripe', () => {
    const provider = new StripePaymentProvider(
      createConfig({ STRIPE_WEBHOOK_SECRET: webhookSecret }),
    );
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_subscription_updated',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            current_period_start: 1_788_249_600,
            current_period_end: 1_790_841_600,
            cancel_at_period_end: false,
            metadata: {
              companyId: '6befc33e-95cd-4ef4-b000-000000000001',
              planLevel: 'PRO',
            },
          },
        },
      }),
    );
    const signature = signPayload(
      payload,
      webhookSecret,
      Math.floor(Date.now() / 1000),
    );

    const event = provider.constructWebhookEvent(payload, signature);

    expect(event).toMatchObject({
      provider: 'STRIPE',
      providerEventId: 'evt_subscription_updated',
      eventType: 'customer.subscription.updated',
      companyId: '6befc33e-95cd-4ef4-b000-000000000001',
      providerSubscriptionId: 'sub_123',
      subscription: {
        providerSubscriptionId: 'sub_123',
        providerCustomerId: 'cus_123',
        planLevel: 'PRO',
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('rejeita webhook Stripe com assinatura inválida', () => {
    const provider = new StripePaymentProvider(
      createConfig({ STRIPE_WEBHOOK_SECRET: webhookSecret }),
    );
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_invalid',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_123' } },
      }),
    );

    expect(() =>
      provider.constructWebhookEvent(payload, 't=1788249600,v1=invalid'),
    ).toThrow(UnauthorizedException);
  });

  it('rejeita webhook Stripe com JSON invalido apos assinatura valida', () => {
    const provider = new StripePaymentProvider(
      createConfig({ STRIPE_WEBHOOK_SECRET: webhookSecret }),
    );
    const payload = Buffer.from('{invalid-json');
    const signature = signPayload(
      payload,
      webhookSecret,
      Math.floor(Date.now() / 1000),
    );

    expect(() => provider.constructWebhookEvent(payload, signature)).toThrow(
      BadRequestException,
    );
  });

  it('rejeita chave publicavel pk_live no backend antes de chamar o checkout', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const provider = new StripePaymentProvider(
      createConfig({
        STRIPE_SECRET_KEY: 'stripe___fixture',
        STRIPE_PRICE_PRO: 'price_pro_live',
      }),
    );

    await expect(
      provider.createCheckoutSession({
        companyId: '6befc33e-95cd-4ef4-b000-000000000001',
        planLevel: 'PRO',
        customerEmail: 'amandacontabil@bcost.com.br',
        customerName: 'Amanda',
        providerCustomerId: null,
        successUrl: 'https://app.bcost.com.br/dashboard/settings?billing=success',
        cancelUrl: 'https://app.bcost.com.br/dashboard/settings?billing=cancel',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejeita price id invalido antes de chamar o checkout Stripe', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const provider = new StripePaymentProvider(
      createConfig({
        STRIPE_SECRET_KEY: 'stripe___fixture',
        STRIPE_PRICE_ENTERPRISE: 'prod_enterprise_live',
      }),
    );

    await expect(
      provider.createCheckoutSession({
        companyId: '6befc33e-95cd-4ef4-b000-000000000001',
        planLevel: 'ENTERPRISE',
        customerEmail: 'amandacontabil@bcost.com.br',
        customerName: 'Amanda',
        providerCustomerId: null,
        successUrl: 'https://app.bcost.com.br/dashboard/settings?billing=success',
        cancelUrl: 'https://app.bcost.com.br/dashboard/settings?billing=cancel',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
