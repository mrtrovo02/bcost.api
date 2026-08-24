import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';

type RequestWithCompanyContext = {
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  companyId?: string;
  user?: {
    id?: string;
    companyId?: string | null;
    activeCompanyId?: string | null;
    companyIds?: string[] | null;
    rolesByCompany?: Record<string, string> | null;
    role?: string | null;
  };
};

/**
 * ARQUIVO: src/common/guards/company-access.guard.ts
 *
 * Garante que o companyId presente na requisição pertence ao usuário autenticado.
 *
 * Aceita como fonte legítima de comparação:
 * - user.companyId (empresa ativa carregada no JWT)
 * - user.activeCompanyId (alias usado por alguns fluxos de sessão)
 * - user.companyIds (todos os tenants ativos vinculados ao usuário)
 *
 * NOTA DE SEGURANÇA: este guard NÃO possui bypass por "role administrativa
 * global" (ex.: ADMIN_MASTER, SUPER_ADMIN). O enum CompanyRole do schema
 * atual só define OWNER, ACCOUNTANT, MANAGER, VIEWER — todos escopados por
 * empresa. Se um papel de administrador de plataforma for introduzido no
 * futuro, ele deve ser modelado explicitamente (ex.: User.platformRole) e
 * o bypass deve ser adicionado aqui de forma auditável, não implícita.
 *
 * Se não houver companyId na requisição, o guard não bloqueia (rotas não
 * escopadas por empresa continuam funcionando normalmente).
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithCompanyContext>();
    const user = request.user;

    // JwtAuthGuard já cuida de autenticação; se não há user, deixa seguir
    // (rota pode ser pública ou protegida por outro guard).
    if (!user) return true;

    const requestedCompanyIds = this.resolveRequestedCompanyIds(request);
    const distinctRequestedCompanyIds = [...new Set(requestedCompanyIds)];

    if (distinctRequestedCompanyIds.length > 1) {
      throw new ForbiddenException(
        'Acesso negado: companyId conflitante entre rota, query, body ou header.',
      );
    }

    const paramCompanyId = distinctRequestedCompanyIds[0] ?? null;

    // Se a requisição não referencia nenhuma empresa, não há o que validar.
    if (!paramCompanyId) return true;

    const allowedCompanyIds = new Set(
      [user.companyId, user.activeCompanyId, ...(user.companyIds ?? [])].filter(
        Boolean,
      ),
    );

    if (!allowedCompanyIds.has(paramCompanyId)) {
      throw new ForbiddenException(
        'Acesso negado: companyId não pertence às empresas vinculadas ao usuário.',
      );
    }

    request.companyId = paramCompanyId;
    user.companyId = paramCompanyId;
    user.activeCompanyId = paramCompanyId;

    const requestRole = user.rolesByCompany?.[paramCompanyId];
    if (requestRole) {
      user.role = requestRole;
    }

    return true;
  }

  private resolveRequestedCompanyIds(request: RequestWithCompanyContext) {
    const redactedHeaders = redactSensitiveHeaders(request.headers);

    return [
      this.toCompanyId(request.params?.companyId),
      this.toCompanyId(request.query?.company_id),
      this.toCompanyId(request.query?.companyId),
      this.toCompanyId(request.body?.companyId),
      this.toCompanyId(request.body?.company_id),
      this.toCompanyId(this.getHeader(redactedHeaders, 'x-company-id')),
    ].filter((value): value is string => Boolean(value));
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
