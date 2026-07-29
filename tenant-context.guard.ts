'use strict';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FastifyRequest } from 'fastify';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';
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

    const redactedHeaders = redactSensitiveHeaders(
      request.headers as Record<string, unknown>,
    );
    const rawTraceId = redactedHeaders['x-bcost-trace-id'];

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
    const role = request.user?.role || null;

    const headerCompanyId = redactedHeaders['x-company-id'];
    const normalizedHeader = Array.isArray(headerCompanyId)
      ? headerCompanyId[0]
      : headerCompanyId;

    const reqParams = (request as Record<string, unknown>).params as
      | Record<string, string>
      | undefined;
    const reqQuery = (request as Record<string, unknown>).query as
      | Record<string, string>
      | undefined;
    const reqBody = (request as Record<string, unknown>).body as
      | Record<string, string>
      | undefined;

    const requestCompanyId =
      reqParams?.companyId ||
      reqQuery?.company_id ||
      reqQuery?.companyId ||
      reqBody?.companyId ||
      (typeof normalizedHeader === 'string' ? normalizedHeader : null);

    const companyId =
      requestCompanyId ||
      request.user?.activeCompanyId ||
      request.user?.companyId ||
      null;

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
        `[TenantContextGuard] userId=${userId ?? 'anonymous'} | companyId=${
          companyId ?? 'none'
        } | requestId=${requestId}`,
      );
    }

    return true;
  }
}
