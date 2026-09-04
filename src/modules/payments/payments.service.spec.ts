import { ConfigService } from '@nestjs/config';
import {
  CheckoutSessionStatus,
  PaymentProvider,
  type PaymentCustomer,
  type CheckoutSession,
  type Subscription,
  SubscriptionStatus,
  WebhookDeliveryStatus,
  type PaymentWebhookEvent as PrismaPaymentWebhookEvent,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../billing/billing-entitlements.service.js';
import { BillingEntitlementsService } from '../billing/billing-entitlements.service.js';
import type {
  PaymentProviderAdapter,
  PaymentProviderWebhookEvent,
} from './domain/payment-provider.types.js';
import { PaymentsService } from './payments.service.js';
import { PaymentProviderFactory } from './providers/payment-provider.factory.js';

type PaymentWebhookEventDelegateMock = {
  findUnique: jest.Mock<Promise<PrismaPaymentWebhookEvent | null>, [unknown]>;
  create: jest.Mock<Promise<PrismaPaymentWebhookEvent>, [unknown]>;
  update: jest.Mock<Promise<PrismaPaymentWebhookEvent>, [unknown]>;
  findMany: jest.Mock<Promise<PrismaPaymentWebhookEvent[]>, [unknown]>;
};

type CheckoutSessionDelegateMock = {
  create: jest.Mock<Promise<CheckoutSession>, [unknown]>;
  updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
};

type PaymentCustomerDelegateMock = {
  findUnique: jest.Mock<Promise<PaymentCustomer | null>, [unknown]>;
  upsert: jest.Mock<Promise<PaymentCustomer>, [unknown]>;
  findFirst: jest.Mock<Promise<PaymentCustomer | null>, [unknown]>;
};

type CompanyDelegateMock = {
  findFirst: jest.Mock<Promise<CompanyBillingContactMock | null>, [unknown]>;
  findUnique: jest.Mock<Promise<{ settings: unknown } | null>, [unknown]>;
  update: jest.Mock<Promise<{ id: string; planLevel: string }>, [unknown]>;
};

type SubscriptionDelegateMock = {
  findFirst: jest.Mock<Promise<Subscription | null>, [unknown]>;
  upsert: jest.Mock<Promise<Subscription>, [unknown]>;
};

type PrismaMock = {
  company: CompanyDelegateMock;
  paymentWebhookEvent: PaymentWebhookEventDelegateMock;
  checkoutSession: CheckoutSessionDelegateMock;
  paymentCustomer: PaymentCustomerDelegateMock;
  subscription: SubscriptionDelegateMock;
};

type ProviderFactoryMock = {
  getProvider: jest.Mock<PaymentProviderAdapter, ['STRIPE']>;
};

type BillingEntitlementsMock = {
  getEntitlements: jest.Mock<Promise<unknown>, [string, AuthUser?]>;
};

type ConfigServiceMock = {
  get: jest.Mock<string | undefined, [string]>;
};

type CompanyBillingContactMock = {
  id: string;
  name: string;
  cnpj: string;
  planLevel: string | null;
  users: Array<{
    user: {
      email: string;
      name: string;
    };
  }>;
};

function createCompanyBillingContact(): CompanyBillingContactMock {
  return {
    id: 'company-001',
    name: 'Empresa Teste LTDA',
    cnpj: '12345678000195',
    planLevel: 'FREE',
    users: [
      {
        user: {
          email: 'amandacontabil@bcost.com.br',
          name: 'Amanda Contabil',
        },
      },
    ],
  };
}

function createCheckoutSessionRecord(
  overrides: Partial<CheckoutSession> = {},
): CheckoutSession {
  const now = new Date('2026-08-31T12:00:00.000Z');

  return {
    id: 'checkout-session-id',
    companyId: 'company-001',
    paymentCustomerId: 'payment-customer-id',
    provider: PaymentProvider.STRIPE,
    providerCheckoutSessionId: 'cs_test_123',
    planLevel: 'PRO',
    status: CheckoutSessionStatus.OPEN,
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    expiresAt: new Date('2026-08-31T13:00:00.000Z'),
    completedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createSubscriptionRecord(
  overrides: Partial<Subscription> = {},
): Subscription {
  const now = new Date('2026-08-31T12:00:00.000Z');

  return {
    id: 'subscription-id',
    companyId: 'company-001',
    paymentCustomerId: 'payment-customer-id',
    provider: PaymentProvider.STRIPE,
    providerSubscriptionId: 'sub_123',
    providerCustomerId: 'cus_123',
    planLevel: 'PRO',
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: now,
    currentPeriodEnd: new Date('2026-09-30T12:00:00.000Z'),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    trialEndsAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createWebhookRecord(
  overrides: Partial<PrismaPaymentWebhookEvent> = {},
): PrismaPaymentWebhookEvent {
  const now = new Date('2026-08-31T12:00:00.000Z');

  return {
    id: 'webhook-event-id',
    companyId: 'company-001',
    provider: PaymentProvider.STRIPE,
    providerEventId: 'evt_123',
    eventType: 'payment_intent.succeeded',
    status: WebhookDeliveryStatus.RECEIVED,
    payload: {},
    processedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPaymentCustomer(
  overrides: Partial<PaymentCustomer> = {},
): PaymentCustomer {
  const now = new Date('2026-08-31T12:00:00.000Z');

  return {
    id: 'payment-customer-id',
    companyId: 'company-001',
    provider: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_123',
    email: 'amandacontabil@bcost.com.br',
    name: 'Amanda Contabil',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaMock: PrismaMock;
  let providerFactoryMock: ProviderFactoryMock;
  let billingEntitlementsMock: BillingEntitlementsMock;
  let configMock: ConfigServiceMock;
  let providerMock: PaymentProviderAdapter;

  beforeEach(() => {
    prismaMock = {
      company: {
        findFirst: jest.fn().mockResolvedValue(createCompanyBillingContact()),
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
        update: jest.fn().mockResolvedValue({
          id: 'company-001',
          planLevel: 'PRO',
        }),
      },
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      checkoutSession: {
        create: jest.fn().mockResolvedValue(createCheckoutSessionRecord()),
        updateMany: jest.fn(),
      },
      paymentCustomer: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue(createPaymentCustomer()),
        findFirst: jest.fn().mockResolvedValue(createPaymentCustomer()),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(createSubscriptionRecord()),
      },
    };

    providerMock = {
      provider: 'STRIPE',
      createCheckoutSession: jest.fn(),
      createBillingPortalSession: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };

    providerFactoryMock = {
      getProvider: jest.fn().mockReturnValue(providerMock),
    };

    billingEntitlementsMock = {
      getEntitlements: jest.fn(),
    };

    configMock = {
      get: jest.fn((key: string) =>
        key === 'FRONTEND_BASE_URL' ? 'https://app.bcost.com.br' : undefined,
      ),
    };

    service = new PaymentsService(
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
      providerFactoryMock as unknown as PaymentProviderFactory,
      billingEntitlementsMock as unknown as BillingEntitlementsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('cria checkout somente quando a empresa não possui assinatura ativa', async () => {
    prismaMock.paymentCustomer.findUnique.mockResolvedValueOnce(
      createPaymentCustomer(),
    );
    jest.mocked(providerMock.createCheckoutSession).mockResolvedValueOnce({
      provider: 'STRIPE',
      providerCheckoutSessionId: 'cs_test_123',
      providerCustomerId: 'cus_123',
      providerSubscriptionId: null,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      status: 'open',
      expiresAt: new Date('2026-08-31T13:00:00.000Z'),
    });

    const result = await service.createCheckoutSession('company-001', {
      planLevel: 'PRO',
      successUrl: 'https://app.bcost.com.br/dashboard/settings?billing=success',
      cancelUrl: 'https://app.bcost.com.br/dashboard/settings?billing=cancel',
    });

    expect(result.status).toBe('OK');
    expect(result.checkoutSession.providerCheckoutSessionId).toBe('cs_test_123');
    expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-001',
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        }),
      }),
    );
    expect(providerMock.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-001',
        planLevel: 'PRO',
      }),
    );
  });

  it('bloqueia novo checkout quando já existe assinatura ativa ou trialing', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce(
      createSubscriptionRecord({
        status: SubscriptionStatus.TRIALING,
        planLevel: 'ENTERPRISE',
      }),
    );

    await expect(
      service.createCheckoutSession('company-001', {
        planLevel: 'PRO',
        successUrl:
          'https://app.bcost.com.br/dashboard/settings?billing=success',
        cancelUrl: 'https://app.bcost.com.br/dashboard/settings?billing=cancel',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        status: 'ACTIVE_SUBSCRIPTION_EXISTS',
        currentPlanLevel: 'ENTERPRISE',
        subscriptionStatus: SubscriptionStatus.TRIALING,
      }),
    });

    expect(providerMock.createCheckoutSession).not.toHaveBeenCalled();
    expect(prismaMock.checkoutSession.create).not.toHaveBeenCalled();
  });

  it('retorna OK_IDEMPOTENT quando o webhook Stripe ja foi processado', async () => {
    const providerEvent: PaymentProviderWebhookEvent = {
      provider: 'STRIPE',
      providerEventId: 'evt_processed',
      eventType: 'checkout.session.completed',
      companyId: 'company-001',
      payload: { id: 'evt_processed' },
    };

    jest
      .mocked(providerMock.constructWebhookEvent)
      .mockReturnValueOnce(providerEvent);
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValueOnce(
      createWebhookRecord({
        providerEventId: 'evt_processed',
        eventType: 'checkout.session.completed',
        status: WebhookDeliveryStatus.PROCESSED,
      }),
    );

    const result = await service.processStripeWebhook(
      Buffer.from('{}'),
      'stripe-signature',
    );

    expect(result.status).toBe('OK_IDEMPOTENT');
    expect(prismaMock.paymentWebhookEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.paymentWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('cria sessao de portal de cobranca para cliente Stripe existente', async () => {
    prismaMock.paymentCustomer.findUnique.mockResolvedValueOnce(
      createPaymentCustomer(),
    );
    jest.mocked(providerMock.createBillingPortalSession).mockResolvedValueOnce({
      provider: 'STRIPE',
      providerPortalSessionId: 'bps_123',
      portalUrl: 'https://billing.stripe.com/p/session/bps_123',
    });

    const result = await service.createBillingPortalSession('company-001', {
      returnUrl: 'https://app.bcost.com.br/dashboard/settings?billing=portal',
    });

    expect(result.portalSession.providerPortalSessionId).toBe('bps_123');
    expect(providerMock.createBillingPortalSession).toHaveBeenCalledWith({
      providerCustomerId: 'cus_123',
      returnUrl: 'https://app.bcost.com.br/dashboard/settings?billing=portal',
    });
  });

  it('bloqueia portal de cobranca com returnUrl fora do dominio oficial', async () => {
    prismaMock.paymentCustomer.findUnique.mockResolvedValueOnce(
      createPaymentCustomer(),
    );

    await expect(
      service.createBillingPortalSession('company-001', {
        returnUrl: 'https://evil.example/phishing',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'returnUrl deve pertencer ao domínio oficial do frontend.',
        statusCode: 400,
      }),
    });

    expect(providerMock.createBillingPortalSession).not.toHaveBeenCalled();
  });

  it('marca webhook sem efeito operacional como IGNORED', async () => {
    const providerEvent: PaymentProviderWebhookEvent = {
      provider: 'STRIPE',
      providerEventId: 'evt_ignored',
      eventType: 'payment_intent.succeeded',
      companyId: 'company-001',
      payload: { id: 'evt_ignored' },
    };

    jest
      .mocked(providerMock.constructWebhookEvent)
      .mockReturnValueOnce(providerEvent);
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValueOnce(null);
    prismaMock.paymentWebhookEvent.create.mockResolvedValueOnce(
      createWebhookRecord({
        providerEventId: 'evt_ignored',
        eventType: 'payment_intent.succeeded',
      }),
    );
    prismaMock.paymentWebhookEvent.update.mockResolvedValueOnce(
      createWebhookRecord({
        providerEventId: 'evt_ignored',
        eventType: 'payment_intent.succeeded',
        status: WebhookDeliveryStatus.IGNORED,
        processedAt: new Date('2026-08-31T12:00:01.000Z'),
      }),
    );

    const result = await service.processStripeWebhook(
      Buffer.from('{}'),
      'stripe-signature',
    );

    expect(result.status).toBe('OK_IGNORED');
    expect(prismaMock.checkoutSession.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WebhookDeliveryStatus.IGNORED,
          errorMessage: null,
        }),
      }),
    );
  });

  it('falha webhook de assinatura sem planLevel monetizavel para nao liberar plano indevido', async () => {
    const providerEvent: PaymentProviderWebhookEvent = {
      provider: 'STRIPE',
      providerEventId: 'evt_missing_plan',
      eventType: 'customer.subscription.updated',
      companyId: 'company-001',
      payload: { id: 'evt_missing_plan' },
      subscription: {
        provider: 'STRIPE',
        providerSubscriptionId: 'sub_missing_plan',
        providerCustomerId: 'cus_123',
        companyId: 'company-001',
        planLevel: null,
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-08-31T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-09-30T12:00:00.000Z'),
        cancelAtPeriodEnd: false,
        metadata: {
          companyId: 'company-001',
        },
      },
    };

    jest
      .mocked(providerMock.constructWebhookEvent)
      .mockReturnValueOnce(providerEvent);
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValueOnce(null);
    prismaMock.paymentWebhookEvent.create.mockResolvedValueOnce(
      createWebhookRecord({
        providerEventId: 'evt_missing_plan',
        eventType: 'customer.subscription.updated',
      }),
    );
    prismaMock.paymentWebhookEvent.update.mockResolvedValueOnce(
      createWebhookRecord({
        providerEventId: 'evt_missing_plan',
        eventType: 'customer.subscription.updated',
        status: WebhookDeliveryStatus.FAILED,
        errorMessage:
          'Webhook de assinatura sem planLevel monetizável no metadata.',
      }),
    );

    await expect(
      service.processStripeWebhook(Buffer.from('{}'), 'stripe-signature'),
    ).rejects.toThrow(
      'Webhook de assinatura sem planLevel monetizável no metadata.',
    );

    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.company.update).not.toHaveBeenCalled();
    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WebhookDeliveryStatus.FAILED,
          errorMessage:
            'Webhook de assinatura sem planLevel monetizável no metadata.',
        }),
      }),
    );
  });

  it('lista eventos de webhook sem retornar payload sensivel', async () => {
    prismaMock.paymentWebhookEvent.findMany.mockResolvedValueOnce([
      createWebhookRecord({
        id: 'audit-event-id',
        providerEventId: 'evt_audit',
        status: WebhookDeliveryStatus.FAILED,
        errorMessage: 'assinatura invalida',
      }),
    ]);

    const result = await service.listWebhookEvents('company-001', {
      status: WebhookDeliveryStatus.FAILED,
      limit: 25,
    });

    expect(result.events).toHaveLength(1);
    expect(result.filters).toEqual({
      status: WebhookDeliveryStatus.FAILED,
      limit: 25,
    });
    expect(result.events[0]?.providerEventId).toBe('evt_audit');
    expect(prismaMock.paymentWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-001',
          status: WebhookDeliveryStatus.FAILED,
        },
        take: 25,
        select: expect.not.objectContaining({ payload: true }),
      }),
    );
  });

  it('limita consultas de eventos de webhook a no máximo 100 registros', async () => {
    prismaMock.paymentWebhookEvent.findMany.mockResolvedValueOnce([]);

    const result = await service.listWebhookEvents('company-001', {
      limit: 500,
    });

    expect(result.filters).toEqual({
      status: null,
      limit: 100,
    });
    expect(prismaMock.paymentWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      }),
    );
  });

  it('usa limite padrão para consultas de eventos de webhook com valor inválido', async () => {
    prismaMock.paymentWebhookEvent.findMany.mockResolvedValueOnce([]);

    const result = await service.listWebhookEvents('company-001', {
      limit: Number.NaN,
    });

    expect(result.filters).toEqual({
      status: null,
      limit: 50,
    });
    expect(prismaMock.paymentWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
      }),
    );
  });
});
