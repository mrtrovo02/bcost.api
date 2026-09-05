import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_COMPANY_CHECK_KEY } from '../decorators/skip-company-check.decorator.js';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';
import { TenantContext } from '../tenant/tenant.context.js';
import { PrismaService } from '../../database/prisma.service.js';

interface TenantContextRequestUser {
  id?: string | null;
  sub?: string | null;
  role?: string | null;
  activeCompanyId?: string | null;
  companyId?: string | null;
}

interface TenantContextRequest {
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: TenantContextRequestUser;
  companyId?: string | null;
  traceId?: unknown;
}

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

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantContextRequest>();
    const skipCompanyContext =
      this.reflector.getAllAndOverride<boolean>(SKIP_COMPANY_CHECK_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const redactedHeaders = redactSensitiveHeaders(
      request.headers,
    );
    const rawTraceId = this.getHeader(redactedHeaders, 'x-bcost-trace-id');

    const requestedCompanyIds = this.resolveRequestedCompanyIds(
      request,
      redactedHeaders,
    );
    const distinctRequestedCompanyIds = [...new Set(requestedCompanyIds)];

    if (distinctRequestedCompanyIds.length > 1) {
      throw new ForbiddenException(
        'Acesso negado: companyId conflitante entre rota, query, body ou header.',
      );
    }

    const requestCompanyId = skipCompanyContext
      ? null
      : distinctRequestedCompanyIds[0] ?? null;

    const userId = request.user?.id ?? request.user?.sub ?? null;
    const role = request.user?.role || null;

    // Prioridade: companyId explícito na requisição > empresa ativa do
    // token > companyId "legado" do token.
    const companyId = skipCompanyContext
      ? null
      : requestCompanyId ||
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

    await this.syncRlsContext(companyId);

    this.logger.debug(
      `[TenantContextGuard] userId=${userId ?? 'anonymous'} | companyId=${
        companyId ?? 'none'
      } | role=${role ?? 'none'}`,
    );

    return true;
  }

  private resolveRequestedCompanyIds(
    request: TenantContextRequest,
    headers: Record<string, unknown>,
  ): string[] {
    return [
      this.toCompanyId(request.params?.companyId),
      this.toCompanyId(request.query?.company_id),
      this.toCompanyId(request.query?.companyId),
      this.toCompanyId(request.body?.companyId),
      this.toCompanyId(request.body?.company_id),
      this.toCompanyId(this.getHeader(headers, 'x-company-id')),
    ].filter((value): value is string => Boolean(value));
  }

  private async syncRlsContext(companyId: string | null): Promise<void> {
    if (!this.prisma) {
      if (companyId && process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'Contexto de tenant indisponível para aplicar isolamento RLS.',
        );
      }

      return;
    }

    try {
      if (companyId) {
        await this.prisma.setRlsCompanyContext(companyId);
      } else {
        await this.prisma.clearRlsCompanyContext();
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync RLS context for company ${companyId ?? 'none'}`,
        error,
      );

      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'Contexto de tenant indisponível para aplicar isolamento RLS.',
        );
      }
    }
  }

  private getHeader(
    headers: Record<string, unknown>,
    name: string,
  ): unknown {
    const normalizedName = name.toLowerCase();
    const entry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === normalizedName,
    );

    return entry?.[1];
  }

  private toCompanyId(value: unknown): string | null {
    const resolved = Array.isArray(value) ? value[0] : value;

    if (typeof resolved !== 'string') return null;

    const normalized = resolved.trim();
    return normalized.length ? normalized : null;
  }
}
