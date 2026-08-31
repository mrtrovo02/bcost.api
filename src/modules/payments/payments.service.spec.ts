import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
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
  updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
};

type PrismaMock = {
  paymentWebhookEvent: PaymentWebhookEventDelegateMock;
  checkoutSession: CheckoutSessionDelegateMock;
};

type ProviderFactoryMock = {
  getProvider: jest.Mock<PaymentProviderAdapter, ['STRIPE']>;
};

type BillingEntitlementsMock = {
  getEntitlements: jest.Mock<Promise<unknown>, [string, AuthUser?]>;
};

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

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaMock: PrismaMock;
  let providerFactoryMock: ProviderFactoryMock;
  let billingEntitlementsMock: BillingEntitlementsMock;
  let providerMock: PaymentProviderAdapter;

  beforeEach(() => {
    prismaMock = {
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      checkoutSession: {
        updateMany: jest.fn(),
      },
    };

    providerMock = {
      provider: 'STRIPE',
      createCheckoutSession: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };

    providerFactoryMock = {
      getProvider: jest.fn().mockReturnValue(providerMock),
    };

    billingEntitlementsMock = {
      getEntitlements: jest.fn(),
    };

    service = new PaymentsService(
      prismaMock as unknown as PrismaService,
      {} as ConfigService,
      providerFactoryMock as unknown as PaymentProviderFactory,
      billingEntitlementsMock as unknown as BillingEntitlementsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
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
});
