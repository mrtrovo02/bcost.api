'use strict';

import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Determina se a rota pode ser acessada.
   * Verifica primeiro se o decorator @Public() está presente nos metadados.
   */
  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Customização da resposta de erro para manter o padrão enterprise do bCost
   */
  override handleRequest<
    TUser = {
      id: string;
      email: string;
      companyId?: string | null;
      role?: string | null;
    },
  >(
    err: unknown,
    user: unknown,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException(
        'Acesso negado: Token JWT inválido ou ausente',
      );
    }
    return user as TUser;
  }
}
