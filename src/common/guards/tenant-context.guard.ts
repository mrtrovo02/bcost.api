import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';
import { TenantContext } from '../tenant/tenant.context.js';

/**
 * ARQUIVO: src/common/guards/tenant-context.guard.ts
 *
 * Resolve o companyId efetivo da requisição e o propaga para o
 * TenantContext (AsyncLocalStorage), que é a fonte que o PrismaService
 * de fato consulta para filtrar queries por tenant.
 *
 * IMPORTANTE: este guard deve ser registrado APÓS o JwtAuthGuard na
 * ordem de execução, para que request.user já esteja disponível. Guards
 * globais no Nest rodam na ordem em que são fornecidos ao APP_GUARD.
 *
 * A validação de AUTORIZAÇÃO (o usuário PODE acessar essa empresa?)
 * continua sendo responsabilidade do CompanyAccessGuard, não deste guard.
 * Este guard nunca bloqueia a requisição — apenas propaga contexto.
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

    // Prioridade: companyId explícito na requisição > empresa ativa do
    // token > companyId "legado" do token.
    const companyId =
      requestCompanyId ||
      request.user?.activeCompanyId ||
      request.user?.companyId ||
      null;

    request.companyId = companyId;
    request.traceId = rawTraceId ?? request.traceId;

    // Ponte real para o AsyncLocalStorage que o PrismaService consulta.
    // Sem isso, o isolamento multi-tenant do Prisma fica inerte mesmo
    // com companyId corretamente resolvido aqui.
    if (TenantContext.hasContext()) {
      TenantContext.patch({
        tenantId: companyId ?? undefined,
        userId: userId ?? undefined,
      });
    }

    this.logger.debug(
      `[TenantContextGuard] userId=${userId ?? 'anonymous'} | companyId=${
        companyId ?? 'none'
      } | role=${role ?? 'none'}`,
    );

    return true;
  }
}
