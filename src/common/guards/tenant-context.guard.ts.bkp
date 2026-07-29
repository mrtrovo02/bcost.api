'use strict';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FastifyRequest } from 'fastify';
import { redactDeep, redactSensitiveHeaders } from '../security/redact-headers.util.js';
import {
  contextStorage,
  RequestContextStore,
} from '../context/context.storage.js';

type AuthenticatedRequest = FastifyRequest & {
  user?: {
    id?: string;
    sub?: string;
    email?: string;
    role?: string;
    companyId?: string;
    activeCompanyId?: string;
  };
  tenantContext?: {
    userId: string | null;
    companyId: string | null;
    role: string | null;
    requestId: string;
  };
};

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const rawTraceId = redactSensitiveHeaders(request.headers as Record<string, unknown>)['x-bcost-trace-id'];

    const requestId =
      typeof rawTraceId === 'string' && rawTraceId.trim().length > 0
        ? rawTraceId
        : String(request.id || randomUUID());

    let store = contextStorage.getStore();

    if (!store) {
      store = {
        requestId,
        traceId: requestId,
        startedAt: Date.now(),
        method: request.method,
        url: request.url,
        userId: null,
        companyId: null,
        role: null,
      } satisfies RequestContextStore;

      contextStorage.enterWith(store);
    }

    const userId = request.user?.sub || request.user?.id || null;
    const companyId =
      request.user?.companyId || request.user?.activeCompanyId || null;
    const role = request.user?.role || null;

    store.userId = userId;
    store.companyId = companyId;
    store.role = role;

    request.tenantContext = {
      userId,
      companyId,
      role,
      requestId,
    };

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[Tenant] userId=${userId ?? 'anonymous'} | companyId=${
          companyId ?? 'none'
        } | requestId=${requestId}`,
      );
    }

    return true;
  }
}
