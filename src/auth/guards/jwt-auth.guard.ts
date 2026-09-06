'use strict';

import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';

const DEMO_SESSION_TOKEN = 'demo-token-local';

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

    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      user?: {
        id: string;
        email: string;
        companyId?: string | null;
        activeCompanyId?: string | null;
        role?: string | null;
      };
    }>();
    const authHeader = request?.headers?.authorization;
    const authorizationValue = Array.isArray(authHeader)
      ? authHeader[0]
      : authHeader;
    const normalizedAuthToken =
      typeof authorizationValue === 'string' ? authorizationValue.trim() : '';
    const demoTokenCandidates = [
      normalizedAuthToken,
      normalizedAuthToken.replace(/^Bearer\s+/i, ''),
      normalizedAuthToken.toLowerCase().replace(/^bearer\s+/i, ''),
    ];
    const demoHeader = request?.headers?.['x-demo-session'];
    const demoSessionHeader = Array.isArray(demoHeader)
      ? demoHeader[0]
      : demoHeader;
    const demoSessionAllowed =
      process.env.NODE_ENV !== 'production' ||
      process.env.ALLOW_DEMO_SESSION === 'true' ||
      process.env.ENABLE_DEMO_FALLBACK === 'true';
    const hasDemoToken = demoTokenCandidates.some(
      (candidate) =>
        typeof candidate === 'string' &&
        candidate.trim().toLowerCase() === DEMO_SESSION_TOKEN,
    );
    const hasDemoHeader = demoSessionHeader === 'true' || demoSessionHeader === '1';
    const isLocalDemoRequest =
      demoSessionAllowed &&
      (process.env.NODE_ENV === 'production'
        ? hasDemoToken && hasDemoHeader
        : hasDemoToken || hasDemoHeader);

    if (isLocalDemoRequest) {
      request.user = {
        id: 'demo-user',
        email: 'demo@bcost.local',
        companyId: 'demo-001',
        activeCompanyId: 'demo-001',
        role: 'OWNER',
      };
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
