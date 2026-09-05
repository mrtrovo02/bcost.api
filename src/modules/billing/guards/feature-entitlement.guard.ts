'use strict';

import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../../common/http/authenticated-request.js';
import {
  BillingEntitlementsService,
  FeatureKey,
} from '../billing-entitlements.service.js';
import { REQUIRED_FEATURE_KEY } from '../decorators/requires-feature.decorator.js';

type RequestWithTenant = AuthenticatedRequest & {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

type FeatureEntitlementCheckResult = {
  allowed: boolean;
  status?: string;
  message: string;
  planLevel: string;
  feature?: {
    minPlan?: string;
    marketReadiness?: string;
    commercialGuardrail?: string;
  };
};

function resolveFeatureBlockStatus(
  status?: string,
): 'FEATURE_LOCKED' | 'FEATURE_ROADMAP_LOCKED' | 'FEATURE_UNKNOWN' {
  if (status === 'ROADMAP_LOCKED') return 'FEATURE_ROADMAP_LOCKED';
  if (status === 'UNKNOWN_FEATURE') return 'FEATURE_UNKNOWN';
  return 'FEATURE_LOCKED';
}

@Injectable()
export class FeatureEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingEntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<FeatureKey>(
      REQUIRED_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const companyId =
      this.toCompanyId(request.companyId) ||
      this.toCompanyId(request.params?.companyId) ||
      this.toCompanyId(request.query?.companyId) ||
      this.toCompanyId(request.query?.company_id) ||
      this.toCompanyId(request.body?.companyId) ||
      this.toCompanyId(request.body?.company_id) ||
      this.toCompanyId(request.user?.companyId) ||
      this.toCompanyId(request.user?.activeCompanyId);

    if (!companyId) {
      throw new BadRequestException(
        `Feature ${requiredFeature} exige contexto de empresa.`,
      );
    }

    const result = (await this.billing.checkFeature(
      companyId,
      requiredFeature,
      request.user,
    )) as FeatureEntitlementCheckResult;

    if (!result.allowed) {
      throw new ForbiddenException({
        status: resolveFeatureBlockStatus(result.status),
        message: result.message,
        companyId,
        feature: requiredFeature,
        planLevel: result.planLevel,
        requiredPlan: result.feature?.minPlan,
        marketReadiness: result.feature?.marketReadiness,
        commercialGuardrail: result.feature?.commercialGuardrail,
      });
    }

    return true;
  }

  private toCompanyId(value: unknown): string | null {
    const resolved = Array.isArray(value) ? value[0] : value;
    return typeof resolved === 'string' && resolved.trim().length > 0
      ? resolved.trim()
      : null;
  }
}
