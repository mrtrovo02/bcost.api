'use strict';

import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AutomationJobService } from './automation-job.service.js';
import { JwtAuthGuard } from '#auth/guards/jwt-auth.guard.js';
import { ApiKeyGuard } from '../../common/guards/api-key.guard.js';

/**
 * AutomationController: Interface de controle para processos em lote do bCost.
 * Permite a execução, agendamento e monitoramento de auditorias fiscais globais.
 */
@ApiTags('Automation')
@ApiBearerAuth()
@Controller('automation')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  private readonly logger = new Logger(AutomationController.name);

  constructor(private readonly automationService: AutomationJobService) {}

  /**
   * DISPARO GLOBAL (AUDITORIA FISCAL)
   * Inicia a varredura de todas as empresas ativas no sistema.
   * Retorna 202 (Accepted) pois a execução ocorre em background (async).
   */
  @Post('trigger-global-audit')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Disparar Auditoria Fiscal Global',
    description:
      'Varre todas as empresas ativas, calcula impostos e notifica divergências em background.',
  })
  @ApiResponse({
    status: 202,
    description: 'Processamento em lote iniciado com sucesso.',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  @ApiResponse({
    status: 500,
    description: 'Erro interno ao iniciar orquestração.',
  })
  async triggerGlobal() {
    this.logger.warn(
      '[Automation Control] Disparo manual de auditoria global iniciado via API.',
    );

    try {
      // Chama o método que orquestra a criação dos Jobs em background
      return await this.automationService.triggerMonthlyGlobalAudit();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Trigger Fail] Falha ao orquestrar jobs: ${message}`);
      throw new BadRequestException(
        'Não foi possível iniciar a auditoria global.',
      );
    }
  }

  /**
   * MONITORAMENTO DE MÉTRICAS (KPIs de Execução)
   * Recupera o volume de Jobs por status (RUNNING, COMPLETED, FAILED).
   * Essencial para o Dashboard administrativo bCost.
   */
  @Get('metrics')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Consultar métricas de saúde dos Jobs' })
  @ApiQuery({
    name: 'group',
    required: false,
    description: 'Filtro por identificador de grupo (ex: GLOBAL_AUDIT_2026-02)',
    example: `GLOBAL_AUDIT_${new Date().toISOString().slice(0, 7)}`,
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas recuperadas.',
    schema: {
      example: {
        timestamp: '2026-02-20T12:00:00.000Z',
        group: 'GLOBAL_AUDIT_2026-02',
        metrics: { RUNNING: 2, COMPLETED: 45, FAILED: 1 },
      },
    },
  })
  async getMetrics(@Query('group') group?: string) {
    this.logger.log(
      `[Metrics Request] Consultando status do grupo: ${group || 'ALL'}`,
    );

    // O método getJobMetrics agora está sincronizado com os Enums do Service
    const metrics = await this.automationService.getJobMetrics(group);

    return {
      timestamp: new Date(),
      group: group || 'all',
      metrics,
    };
  }
}
