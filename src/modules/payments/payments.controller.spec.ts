import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

type PaymentsServiceMock = {
  createCheckoutSession: jest.Mock;
  getSubscription: jest.Mock;
  listWebhookEvents: jest.Mock;
  processStripeWebhook: jest.Mock;
};

function createRequest(
  overrides: Partial<AuthenticatedRequest> = {},
): AuthenticatedRequest {
  return {
    user: {
      id: 'user-001',
      sub: 'user-001',
      email: 'amandacontabil@bcost.com.br',
      companyId: 'company-001',
      role: 'OWNER',
    },
    ...overrides,
  } as AuthenticatedRequest;
}

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let paymentsMock: PaymentsServiceMock;

  beforeEach(() => {
    paymentsMock = {
      createCheckoutSession: jest.fn(),
      getSubscription: jest.fn(),
      listWebhookEvents: jest.fn(),
      processStripeWebhook: jest.fn(),
    };

    controller = new PaymentsController(
      paymentsMock as unknown as PaymentsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('encaminha checkout com empresa, dto e usuario autenticado', async () => {
    const dto = {
      planLevel: 'PRO' as const,
      successUrl: 'https://app.bcost.com.br/dashboard/settings?billing=success',
      cancelUrl: 'https://app.bcost.com.br/dashboard/settings?billing=cancel',
    };
    const request = createRequest();
    paymentsMock.createCheckoutSession.mockResolvedValueOnce({ status: 'OK' });

    await expect(
      controller.createCheckout('company-001', dto, request),
    ).resolves.toEqual({ status: 'OK' });

    expect(paymentsMock.createCheckoutSession).toHaveBeenCalledWith(
      'company-001',
      dto,
      request.user,
    );
  });

  it('lista eventos de webhook por empresa sem exigir payload do gateway', async () => {
    paymentsMock.listWebhookEvents.mockResolvedValueOnce({
      status: 'OK',
      companyId: 'company-001',
      events: [],
    });

    await expect(controller.webhookEvents('company-001')).resolves.toEqual({
      status: 'OK',
      companyId: 'company-001',
      events: [],
    });

    expect(paymentsMock.listWebhookEvents).toHaveBeenCalledWith('company-001');
  });

  it('rejeita webhook Stripe sem rawBody para preservar validacao criptografica', () => {
    expect(() =>
      controller.stripeWebhook(createRequest(), 't=123,v1=signature'),
    ).toThrow(BadRequestException);

    expect(paymentsMock.processStripeWebhook).not.toHaveBeenCalled();
  });

  it('processa webhook Stripe somente com rawBody original', async () => {
    const rawBody = Buffer.from('{"id":"evt_123"}');
    const request = {
      ...createRequest(),
      rawBody,
    };
    paymentsMock.processStripeWebhook.mockResolvedValueOnce({
      status: 'OK',
      providerEventId: 'evt_123',
    });

    await expect(
      controller.stripeWebhook(request, 't=123,v1=signature'),
    ).resolves.toEqual({
      status: 'OK',
      providerEventId: 'evt_123',
    });

    expect(paymentsMock.processStripeWebhook).toHaveBeenCalledWith(
      rawBody,
      't=123,v1=signature',
    );
  });
});
