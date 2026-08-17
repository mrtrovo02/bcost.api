import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantContext } from '../../common/tenant/tenant.context.js';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * bCost Guard: Validação de Identidade e Vínculo de Tenant
 * Este Guard garante que o usuário não apenas tenha um token válido,
 * mas que ele pertença à empresa que está tentando acessar.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticação ausente.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      // Validação de Segurança Nível 3: Verifica vínculo real no banco
      const membership = await this.prisma.companyUser.findUnique({
        where: {
          userId_companyId: {
            userId: payload.sub,
            companyId: payload.companyId,
          },
        },
      });

      if (!membership || membership.deletedAt) {
        throw new ForbiddenException(
          'Acesso negado: Usuário não vinculado a este Tenant.',
        );
      }

      // POPULA O STORE CANÔNICO (O patch que você criou)
      TenantContext.patch({
        tenantId: payload.companyId,
        userId: payload.sub,
      });

      request['user'] = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }

  private extractTokenFromHeader(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const authorizationHeader = request.headers?.authorization;
    const authorization = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader || '';
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
