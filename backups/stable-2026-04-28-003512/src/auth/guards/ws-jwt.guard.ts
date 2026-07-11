import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();

      // No WebSocket, o token costuma vir no header 'Authorization' ou no 'auth' object do handshake
      const headerAuth = client.handshake.headers.authorization;
      const authHeader =
        (typeof headerAuth === 'string'
          ? headerAuth
          : Array.isArray(headerAuth)
            ? headerAuth[0]
            : undefined) ||
        (typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : undefined);

      if (!authHeader) {
        throw new WsException('Token de acesso não fornecido.');
      }

      const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

      // Validação técnica do JWT
      const payload =
        await this.jwtService.verifyAsync<Record<string, unknown>>(token);

      // Valida existência/atividade do usuário (revogação imediata)
      const userId =
        typeof payload.sub === 'string'
          ? payload.sub
          : typeof payload.id === 'string'
            ? payload.id
            : undefined;
      if (!userId) {
        throw new WsException('Token inválido.');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true },
      });

      if (!user || !user.active) {
        throw new WsException('Usuário inativo ou inexistente.');
      }

      // Injeta o usuário no socket para uso posterior (ex: identificar empresa)
      client['user'] = payload;

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Falha na autenticação via WebSocket: ${message}`);
      throw new WsException('Sessão inválida ou expirada.');
    }
  }
}
