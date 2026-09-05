import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureEntitlementGuard } from './feature-entitlement.guard.js';
import { BillingEntitlementsService } from '../billing-entitlements.service.js';
import { REQUIRED_FEATURE_KEY } from '../decorators/requires-feature.decorator.js';

type BillingMock = Pick<BillingEntitlementsService, 'checkFeature'>;

type MockRequest = {
  companyId?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: {
    companyId?: string | null;
    activeCompanyId?: string | null;
  };
};

function createContext(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
    getHandler: jest.fn().mockReturnValue(function handler() {
      return undefined;
    }),
    getClass: jest.fn().mockReturnValue(class TestController {}),
  } as unknown as ExecutionContext;
}

describe('FeatureEntitlementGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let billing: jest.Mocked<BillingMock>;
  let guard: FeatureEntitlementGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('revenue.billing'),
    };
    billing = {
      checkFeature: jest.fn(),
    };
    guard = new FeatureEntitlementGuard(
      reflector as unknown as Reflector,
      billing as unknown as BillingEntitlementsService,
    );
  });

  it('allows requests when the route does not require a feature', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(billing.checkFeature).not.toHaveBeenCalled();
  });

  it('requires company context for monetized routes', async () => {
    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      BadRequestException,
    );
    expect(billing.checkFeature).not.toHaveBeenCalled();
  });

  it('returns explicit FEATURE_UNKNOWN payload for unmapped feature keys', async () => {
    billing.checkFeature.mockResolvedValueOnce({
      allowed: false,
      status: 'UNKNOWN_FEATURE',
      message: 'Feature não catalogada.',
      planLevel: 'PRO',
    });

    await expect(
      guard.canActivate(
        createContext({
          params: { companyId: 'company-123' },
          user: { companyId: 'company-123' },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        status: 'FEATURE_UNKNOWN',
        message: 'Feature não catalogada.',
        companyId: 'company-123',
        feature: 'revenue.billing',
        planLevel: 'PRO',
      },
    });
  });

  it('returns roadmap lock payload without falling back to a generic paywall', async () => {
    billing.checkFeature.mockResolvedValueOnce({
      allowed: false,
      status: 'ROADMAP_LOCKED',
      message: 'Recurso em roadmap controlado.',
      planLevel: 'ENTERPRISE',
      feature: {
        minPlan: 'ENTERPRISE',
        marketReadiness: 'ROADMAP_LOCKED',
        commercialGuardrail: 'Não vender como automação pronta.',
      },
    });

    await expect(
      guard.canActivate(
        createContext({
          companyId: 'company-123',
          user: { companyId: 'company-123' },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        status: 'FEATURE_ROADMAP_LOCKED',
        message: 'Recurso em roadmap controlado.',
        commercialGuardrail: 'Não vender como automação pronta.',
      },
    });
  });

  it('throws ForbiddenException when plan is insufficient', async () => {
    billing.checkFeature.mockResolvedValueOnce({
      allowed: false,
      status: 'LOCKED',
      message: 'Feature exige plano mínimo ENTERPRISE.',
      planLevel: 'FREE',
      feature: {
        minPlan: 'ENTERPRISE',
        marketReadiness: 'SELLABLE',
      },
    });

    await expect(
      guard.canActivate(
        createContext({
          query: { companyId: 'company-123' },
          user: { companyId: 'company-123' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
