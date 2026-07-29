import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';

/**
 * ARQUIVO: src/common/guards/tenant-context.guard.ts
 *
 * Resolve e loga o companyId efetivo da requisição, a partir de múltiplas
 * fontes (params, query, body, header x-company-id, ou o companyId/
 * activeCompanyId do token). Não bloqueia a requisição — apenas propaga
 * contexto de tenant para interceptors/auditoria/observabilidade.
 *
 * A validação de autorização (o usuário PODE acessar essa empresa?) é
 * responsabilidade do CompanyAccessGuard, não deste guard.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const redactedHeaders = redactSensitiveHeaders(
      request.headers as Record<string, unknown>,
    );
    const rawTraceId = redactedHeaders['x-bcost-trace-id'];

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

    const userId = request.user?.id ?? request.user?.sub ?? null;
    const role = request.user?.role || null;

    const companyId =
      requestCompanyId ||
      request.user?.activeCompanyId ||
      request.user?.companyId ||
      null;

    request.companyId = companyId;
    request.traceId = rawTraceId ?? request.traceId;

    this.logger.debug(
      `[TenantContextGuard] userId=${userId ?? 'anonymous'} | companyId=${
        companyId ?? 'none'
      } | role=${role ?? 'none'}`,
    );

    return true;
  }
}
