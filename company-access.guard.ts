'use strict';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SKIP_COMPANY_CHECK_KEY } from '../decorators/skip-company-check.decorator.js';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';

/**
 * CompanyAccessGuard
 *
 * Garante que o companyId presente na requisição pertence ao usuário autenticado
 * ou que o usuário possui perfil com permissões globais (ADMIN_MASTER, MASTER, SUPER_ADMIN, ADMIN).
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
      | {
          id?: string;
          companyId?: string | null;
          activeCompanyId?: string | null;
          role?: string | null;
        }
      | undefined;

    if (!user?.id) return true;

    const redactedHeaders = redactSensitiveHeaders(
      request.headers as Record<string, unknown>,
    );
    const headerCompanyId = redactedHeaders?.['x-company-id'];
    const normalizedHeader = Array.isArray(headerCompanyId)
      ? headerCompanyId[0]
      : headerCompanyId;

    const paramCompanyId =
      request.params?.companyId ??
      request.query?.company_id ??
      request.query?.companyId ??
      request.body?.companyId ??
      (typeof normalizedHeader === 'string' ? normalizedHeader : null);

    if (!paramCompanyId) {
      return true;
    }

    const globalRoles = ['ADMIN_MASTER', 'MASTER', 'SUPER_ADMIN', 'ADMIN'];
    const userRole = user.role ? String(user.role).toUpperCase() : '';
    if (globalRoles.includes(userRole)) {
      request.companyId = paramCompanyId;
      return true;
    }

    const allowedCompanyIds = [
      user.companyId,
      user.activeCompanyId,
    ].filter(Boolean);

    if (!allowedCompanyIds.includes(paramCompanyId)) {
      throw new ForbiddenException(
        'Acesso negado: companyId não corresponde à empresa ativa do usuário.',
      );
    }

    request.companyId = paramCompanyId;

    return true;
  }
}
