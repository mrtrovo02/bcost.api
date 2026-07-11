'use strict';

// =============================================================================
// ARQUIVO: src/common/guards/company-access.guard.ts
// =============================================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SKIP_COMPANY_CHECK_KEY } from '../decorators/skip-company-check.decorator.js';
import { redactDeep, redactSensitiveHeaders } from '../security/redact-headers.util.js';

/**
 * CompanyAccessGuard
 *
 * Garante que o companyId presente na requisição pertence ao usuário autenticado.
 * Este guard NÃO troca o tenant ativo — ele valida coerência entre:
 * - companyId da rota/corpo/header
 * - companyId ativo do token (req.user.companyId)
 *
 * Se não houver companyId na requisição, o guard não bloqueia.
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipCompanyCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_COMPANY_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipCompanyCheck) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { id?: string; companyId?: string | null }
      | undefined;

    // JwtAuthGuard já cuida de autenticação; se não há user, deixa seguir.
    if (!user?.id) return true;

    const headerCompanyId = redactSensitiveHeaders(request.headers as Record<string, unknown>)?.['x-company-id'];
    const normalizedHeader = Array.isArray(headerCompanyId)
      ? headerCompanyId[0]
      : headerCompanyId;

    const paramCompanyId =
      request.params?.companyId ??
      request.body?.companyId ??
      request.query?.companyId ??
      normalizedHeader;

    if (!paramCompanyId) {
      return true;
    }

    if (!user.companyId || user.companyId !== paramCompanyId) {
      throw new ForbiddenException(
        'Acesso negado: companyId não corresponde à empresa ativa do usuário.',
      );
    }

    // Propaga companyId validado para uso em interceptors/auditoria
    request.companyId = paramCompanyId;

    return true;
  }
}
