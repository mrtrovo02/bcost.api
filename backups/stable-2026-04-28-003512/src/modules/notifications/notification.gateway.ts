'use strict';

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from '#auth/guards/ws-jwt.guard.js';
import { NotificationPrismaService } from './notification-prisma.service.js';
import { JwtService } from '@nestjs/jwt';

type JwtPayload = {
  sub?: string;
  id?: string;
  companyId?: string;
};

type SocketWithUser = Socket & { user?: JwtPayload };
type ReconciliationResult = { autoReconciled: number } & Record<
  string,
  unknown
>;

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5000'],
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private socketToCompany = new Map<string, string>();

  constructor(
    private readonly prismaService: NotificationPrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Gerencia a conexão inicial, validação de token e entrada em salas
   */
  async handleConnection(client: Socket) {
    try {
      const authHeader =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : typeof client.handshake.headers.authorization === 'string'
            ? client.handshake.headers.authorization
            : undefined;

      if (!authHeader) {
        this.logger.warn(
          `[WS] Conexão rejeitada: token ausente (socket: ${client.id})`,
        );
        client.disconnect();
        return;
      }

      const token = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

      // Valida o JWT e injeta o payload no socket
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (client as SocketWithUser).user = payload;

      const userId = payload.sub || payload.id;

      // Extrair companyId da query string ou do payload JWT para auto-join
      const queryCompany =
        typeof client.handshake.query.companyId === 'string'
          ? client.handshake.query.companyId
          : undefined;
      const companyId = queryCompany || payload.companyId;

      if (companyId && userId) {
        const belongs = await this.prismaService.prisma.companyUser.findFirst({
          where: { userId, companyId },
          select: { id: true },
        });

        if (!belongs) {
          this.logger.warn(
            `[WS] Acesso negado: user=${userId} não pertence à company=${companyId}`,
          );
          client.disconnect();
          return;
        }

        void client.join(`company_${companyId}`);
        this.socketToCompany.set(client.id, companyId);
        this.logger.log(
          `📡 Cliente conectado e alocado: company_${companyId} (socket: ${client.id})`,
        );
      } else {
        this.logger.warn(
          `[WS] Cliente conectado sem companyId (socket: ${client.id})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[WS] Erro crítico na conexão: ${message}`);
      client.disconnect();
    }
  }

  /**
   * Limpa o mapeamento ao desconectar
   */
  handleDisconnect(client: Socket) {
    const companyId = this.socketToCompany.get(client.id);
    if (companyId) {
      this.socketToCompany.delete(client.id);
      this.logger.log(
        `🔌 Cliente desconectado da sala company_${companyId} (socket: ${client.id})`,
      );
    } else {
      this.logger.log(`🔌 Cliente desconectado (socket: ${client.id})`);
    }
  }

  /**
   * Permite que o cliente mude ou se inscreva em uma sala de empresa específica com validação RBAC
   */
  @SubscribeMessage('subscribe')
  @UseGuards(WsJwtGuard)
  async handleSubscribe(
    @MessageBody() data: { companyId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const companyId = data.companyId;
    const user = (client as SocketWithUser).user; // Ajustado para pegar do payload decodificado pelo Guard

    if (!companyId) {
      return { event: 'error', data: 'companyId é obrigatório' };
    }

    if (user) {
      // Validação de segurança: O usuário realmente pertence a esta empresa no bCost?
      const belongs = await this.prismaService.prisma.companyUser.findFirst({
        where: { userId: user.sub || user.id, companyId },
      });

      if (!belongs) {
        this.logger.error(
          `[WS] Tentativa de acesso não autorizado: User ${user.sub || user.id} -> Company ${companyId}`,
        );
        return { event: 'error', data: 'Acesso negado a esta empresa' };
      }
    }

    void client.join(`company_${companyId}`);
    this.socketToCompany.set(client.id, companyId);
    this.logger.log(
      `[WS] Cliente ${client.id} inscrito com sucesso na sala company_${companyId}`,
    );

    return { event: 'subscribed', data: { companyId } };
  }

  // ===========================================================================
  // MÉTODOS DE BROADCAST (Chamados pelos Services)
  // ===========================================================================

  /**
   * Envia atualizações genéricas do módulo Fiscal/Banking
   */
  sendNotification(companyId: string, payload: any) {
    this.server.to(`company_${companyId}`).emit('fiscal_update', payload);
    this.logger.debug(
      `[WS] Notificação fiscal enviada para company_${companyId}`,
    );
  }

  /**
   * Atualiza widgets do Dashboard em tempo real
   */
  sendDashboardUpdate(companyId: string, data: any) {
    this.server.to(`company_${companyId}`).emit('dashboard-update', data);
    this.logger.debug(
      `[WS] Dashboard update enviado para company_${companyId}`,
    );
  }

  /**
   * Notifica o término da conciliação automática (Auto-Match)
   */
  sendReconciliationFinished(companyId: string, result: ReconciliationResult) {
    this.server.to(`company_${companyId}`).emit('reconciliation_finished', {
      title: 'Conciliação Concluída',
      content: `${result.autoReconciled} transações foram vinculadas automaticamente.`,
      data: result,
      timestamp: new Date(),
    });
    this.logger.log(
      `[WS] Evento 'reconciliation_finished' disparado para company_${companyId}`,
    );
  }
}
