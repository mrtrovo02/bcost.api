import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';

/**
 * ARQUIVO: src/common/guards/company-access.guard.ts
 *
 * Garante que o companyId presente na requisição pertence ao usuário autenticado.
 *
 * Aceita como fonte legítima de comparação:
 * - user.companyId (empresa ativa carregada no JWT)
 * - user.activeCompanyId (alias usado por alguns fluxos de sessão)
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
    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | {
          id?: string;
          companyId?: string | null;
          activeCompanyId?: string | null;
          role?: string | null;
        }
      | undefined;

    // JwtAuthGuard já cuida de autenticação; se não há user, deixa seguir
    // (rota pode ser pública ou protegida por outro guard).
    if (!user) return true;

    const redactedHeaders = redactSensitiveHeaders(
      request.headers as Record<string, unknown>,
    );
    const headerCompanyId = redactedHeaders?.['x-company-id'];
    const normalizedHeader = Array.isArray(headerCompanyId)
      ? headerCompanyId[0]
      : headerCompanyId;

    const paramCompanyId: string | null =
      request.params?.companyId ??
      request.query?.company_id ??
      request.query?.companyId ??
      request.body?.companyId ??
      (typeof normalizedHeader === 'string' ? normalizedHeader : null);

    // Se a requisição não referencia nenhuma empresa, não há o que validar.
    if (!paramCompanyId) return true;

    const allowedCompanyIds = [user.companyId, user.activeCompanyId].filter(
      Boolean,
    );

    if (!allowedCompanyIds.includes(paramCompanyId)) {
      throw new ForbiddenException(
        'Acesso negado: companyId não corresponde à empresa ativa do usuário.',
      );
    }

    request.companyId = paramCompanyId;
    return true;
  }
}
