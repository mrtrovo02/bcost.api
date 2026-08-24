'use strict';

import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiAcceptedResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ReconciliationService } from '../reconciliation.service.js';
import { ReconciliationQueryDto } from '../dto/reconciliation-query.dto.js';
import { GetUser } from '../../auth/decorators/get-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard.js';
import { LegacyApiAlias } from '../../../common/decorators/legacy-api-alias.decorator.js';
import { CompanyAccessGuard } from '../../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../../common/guards/tenant-context.guard.js';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    @InjectQueue('reconciliation-queue') private readonly reconQueue: Queue, // 🚀 Fila de processamento
  ) {}

  /**
   * Realiza a conciliação manual (1:1).
   * Rota: POST /reconciliation/manual
   */
  @Post('manual')
  @LegacyApiAlias('/banking/enterprise/reconciliation/:companyId/manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Conciliação manual de transação',
    description:
      'Vincula uma transação bancária a uma nota fiscal ou obrigação fiscal manualmente.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['bankTransactionId'],
      properties: {
        companyId: {
          type: 'string',
          format: 'uuid',
          description: 'ID da empresa',
        },
        bankTransactionId: {
          type: 'string',
          format: 'uuid',
          description: 'ID da transação bancária',
        },
        invoiceId: {
          type: 'string',
          format: 'uuid',
          description: 'ID da nota fiscal (opcional)',
        },
        taxObligationId: {
          type: 'string',
          format: 'uuid',
          description: 'ID da obrigação fiscal (opcional)',
        },
        force: {
          type: 'boolean',
          description: 'Forçar conciliação mesmo se já estiver conciliada?',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Conciliação manual realizada com sucesso.' })
  @ApiBadRequestResponse({
    description: 'Dados inválidos ou nenhum ID de destino fornecido.',
  })
  @ApiUnauthorizedResponse({ description: 'Não autorizado.' })
  async manualMatch(
    @GetUser('id') userId: string,
    @Body()
    body: {
      companyId: string;
      bankTransactionId: string;
      invoiceId?: string;
      taxObligationId?: string;
      force?: boolean;
    },
  ) {
    return await this.reconciliationService.manualMatch(
      body.bankTransactionId,
      {
        invoiceId: body.invoiceId,
        taxObligationId: body.taxObligationId,
        force: body.force,
        companyId: body.companyId,
      },
      userId,
    );
  }

  /**
   * Retorna o resumo (Dashboard) de conciliação da empresa.
   * Rota: GET /reconciliation/summary/:companyId
   */
  @Get('summary/:companyId')
  @LegacyApiAlias('/banking/enterprise/summary/:companyId')
  @ApiOperation({
    summary: 'Resumo de conciliação para Dashboard',
    description:
      'Retorna estatísticas de valores e quantidades de transações conciliadas vs pendentes.',
  })
  @ApiParam({
    name: 'companyId',
    type: 'string',
    format: 'uuid',
    description: 'ID da empresa',
  })
  @ApiOkResponse({
    description: 'Resumo retornado com sucesso.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'CONCILIADO' },
          count: { type: 'number', example: 150 },
          total: { type: 'number', example: 45000.5 },
        },
      },
    },
  })
  async getSummary(@Param('companyId') companyId: string) {
    return await this.reconciliationService.getSummary(companyId);
  }

  /**
   * Consulta transações conciliadas ou pendentes com filtros.
   * Rota: GET /reconciliation/query
   */
  @Get('query')
  @LegacyApiAlias('/banking/enterprise/transactions/:companyId')
  @ApiOperation({
    summary: 'Consultar transações conciliadas/pendentes',
    description:
      'Retorna lista de transações com filtros por empresa, período, status, etc.',
  })
  @ApiQuery({
    type: ReconciliationQueryDto,
    description: 'Filtros de consulta',
  })
  @ApiOkResponse({ description: 'Consulta realizada com sucesso.' })
  @ApiUnauthorizedResponse({ description: 'Não autorizado.' })
  async query(@Query() query: ReconciliationQueryDto) {
    return await this.reconciliationService.queryMatches(query);
  }

  /**
   * Dispara o motor de conciliação automática via FILA (Background Job).
   * Rota: POST /reconciliation/auto/:companyId
   */
  @Post('auto/:companyId')
  @LegacyApiAlias('/banking/enterprise/reconciliation/:companyId/auto')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Executar conciliação automática (Async)',
    description:
      'Adiciona a tarefa de conciliação automática na fila para processamento em background.',
  })
  @ApiParam({
    name: 'companyId',
    type: 'string',
    format: 'uuid',
    description: 'ID da empresa',
  })
  @ApiAcceptedResponse({
    description: 'Job de conciliação agendado com sucesso.',
    schema: {
      properties: {
        jobId: { type: 'string', example: '123' },
        message: {
          type: 'string',
          example: 'Processamento iniciado em segundo plano.',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Não autorizado.' })
  async triggerAutoMatch(@Param('companyId') companyId: string) {
    // Adiciona o job à fila BullMQ
    const job = await this.reconQueue.add(
      'auto-match-job',
      { companyId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    );

    return {
      jobId: job.id,
      message:
        'O motor de conciliação está processando os dados em segundo plano. Você será notificado via sistema ao concluir.',
    };
  }

  /**
   * Desfaz uma conciliação existente.
   * Rota: DELETE /reconciliation/undo/:bankTransactionId
   */
  @Delete('undo/:bankTransactionId')
  @LegacyApiAlias(
    '/banking/enterprise/reconciliation/:companyId/undo/:transactionId',
  )
  @ApiOperation({
    summary: 'Desfazer conciliação',
    description:
      'Remove o vínculo de conciliação de uma transação bancária, tornando-a pendente novamente.',
  })
  @ApiParam({
    name: 'bankTransactionId',
    type: 'string',
    format: 'uuid',
    description: 'ID da transação bancária',
  })
  @ApiOkResponse({ description: 'Conciliação desfeita com sucesso.' })
  @ApiNotFoundResponse({
    description: 'Transação não encontrada ou não conciliada.',
  })
  @ApiUnauthorizedResponse({ description: 'Não autorizado.' })
  async undoMatch(
    @GetUser('id') userId: string,
    @Param('bankTransactionId') bankTransactionId: string,
  ) {
    return await this.reconciliationService.undoMatch(
      bankTransactionId,
      userId,
    );
  }
}
