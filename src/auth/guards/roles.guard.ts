'use strict';

// FIX: Membros de decoradores e exceções vêm do @nestjs/common
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../jwt.strategy.js';

/**
 * RolesGuard: Garante que o usuário possua o CompanyRole necessário
 * para acessar o recurso específico da empresa.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Busca as roles definidas no decorador @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<CompanyRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se a rota não tiver o decorador @Roles, o acesso é liberado (default)
    if (!requiredRoles) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const { user } = request;

    // Validação robusta do payload do usuário
    if (!user || !user.role) {
      throw new ForbiddenException(
        'Identidade ou nível de acesso não identificado.',
      );
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Acesso negado. Requerido: [${requiredRoles.join(', ')}]. Seu nível: ${user.role}`,
      );
    }

    return true;
  }
}
