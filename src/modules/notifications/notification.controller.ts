'use strict';

import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service.js';
import { JwtAuthGuard } from '#auth/guards/jwt-auth.guard.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';
import { LegacyApiAlias } from '../../common/decorators/legacy-api-alias.decorator.js';

/**
 * NotificationController: Camada de Orquestração de Alertas bCost.
 * Ponto de entrada para o Dashboard e conformidade fiscal.
 */
@ApiTags('Notification')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * LISTAGEM ESTRATÉGICA
   * Recupera o histórico de notificações isolado por empresa.
   */
  @Get()
  @LegacyApiAlias('/notifications/enterprise/:companyId')
  @ApiOperation({ summary: 'Listar notificações da empresa vinculada' })
  @ApiResponse({
    status: 200,
    description: 'Coleção de notificações recuperada.',
  })
  @ApiResponse({ status: 400, description: 'Erro de contexto de usuário.' })
  async findMyNotifications(
    @GetUser('id') userId: string,
    @GetUser('companyId') companyId: string,
  ) {
    if (!userId || !companyId) {
      this.logger.error(
        `[Access Error] Tentativa de acesso sem companyId. User: ${userId}`,
      );
      throw new BadRequestException(
        'Vínculo empresarial não detectado no perfil.',
      );
    }

    this.logger.log(`[Fetch] Buscando alertas para Company: ${companyId}`);
    return await this.notificationService.findByCompany(companyId);
  }

  /**
   * CONFIRMAÇÃO DE LEITURA (ACKNOWLEDGE)
   * Gera trilha de auditoria e ciência do cliente.
   */
  @Patch(':id/ack')
  @LegacyApiAlias(
    '/notifications/enterprise/:companyId/:notificationId/acknowledge',
  )
  @ApiOperation({ summary: 'Confirmar ciência e processamento da notificação' })
  @ApiParam({
    name: 'id',
    description: 'ID da notificação (UUID)',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Status atualizado e log de auditoria gerado.',
  })
  @ApiResponse({ status: 404, description: 'Notificação não encontrada.' })
  async acknowledgeNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @GetUser('companyId') companyId: string,
  ) {
    try {
      this.logger.log(
        `[ACK] Processando leitura da notificação ${id} pelo usuário ${userId}`,
      );

      const result = await this.notificationService.acknowledge({
        notificationId: id,
        companyId,
        userId,
      });

      if (!result) {
        throw new NotFoundException(
          'Notificação não encontrada para esta empresa.',
        );
      }

      return {
        success: true,
        message: 'Leitura confirmada com sucesso.',
        data: result,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ACK Fail] Erro ao confirmar notificação: ${message}`);
      throw error;
    }
  }
}
