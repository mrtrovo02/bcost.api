'use strict';

import {
  Controller,
  Post,
  Get,
  Query,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';

import { RevenueService } from './revenue.service.js';
import { CalculateFactorRUseCase } from './use-cases/calculate-factor-r.use-case.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';

// Importação dos DTOs robustos (devem ser criados na pasta ./dto)
import { RevenueMetricsResponseDto } from './dto/revenue-metrics-response.dto.js';
import { FactorRResponseDto } from './dto/factor-r-response.dto.js';

/**
 * RevenueController: Endpoint para gestão de faturamento, métricas e inteligência fiscal.
 * Focado em conformidade com o Anexo III do Simples Nacional e automação financeira.
 */
@ApiTags('Financial - Revenue (Gestão de Receita)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('revenue')
export class RevenueController {
  private readonly logger = new Logger(RevenueController.name);

  constructor(
    private readonly revenueService: RevenueService,
    private readonly calculateFactorRUseCase: CalculateFactorRUseCase,
  ) {}

  /**
   * Dispara o faturamento de contratos.
   * Útil para o contador forçar o fechamento do dia.
   */
  @Post('process-billing/:companyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Processar Faturamento Mensal',
    description:
      'Varre contratos ativos e gera faturas para aqueles que vencem hoje via transação atômica.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'ID da empresa (UUID)',
    type: 'string',
    format: 'uuid',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiOkResponse({
    description:
      'Processamento concluído: Faturas geradas e AuditLog registrado.',
  })
  @ApiResponse({
    status: 400,
    description: 'ID de empresa inválido ou falha na transação do banco.',
  })
  @ApiResponse({ status: 401, description: 'Token JWT ausente ou inválido.' })
  async processBilling(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    this.logger.debug(
      `🎬 Requisição recebida: Processar faturamento para ${companyId}`,
    );
    return await this.revenueService.processMonthlyBilling(companyId);
  }

  /**
   * Obtém métricas para o Dashboard de Faturamento.
   * Une dados agregados do Prisma com a lógica de inteligência fiscal.
   */
  @Get('metrics/:companyId')
  @ApiOperation({
    summary: 'Métricas de Faturamento e Dashboards',
    description:
      'Retorna o total faturado consolidado e o status preditivo do Fator R.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'ID da empresa (UUID)',
    type: 'string',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'month',
    required: true,
    example: 2,
    description: 'Mês de competência (1-12)',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    example: 2026,
    description: 'Ano de competência',
  })
  @ApiOkResponse({
    description: 'Métricas retornadas com sucesso.',
    type: RevenueMetricsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async getMetrics(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ): Promise<RevenueMetricsResponseDto> {
    this.logger.debug(
      `📊 Buscando métricas para empresa ${companyId} em ${month}/${year}`,
    );
    return await this.revenueService.getRevenueMetrics(companyId, month, year);
  }

  /**
   * Endpoint específico para consulta profunda do Fator R.
   */
  @Get('factor-r/:companyId')
  @ApiOperation({
    summary: 'Consulta de Fator R (Deep Analysis)',
    description:
      'Analisa faturamento vs folha dos últimos 12 meses. Base para enquadramento fiscal.',
  })
  @ApiParam({
    name: 'companyId',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Cálculo de Fator R realizado com sucesso.',
    type: FactorRResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async getFactorR(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ): Promise<FactorRResponseDto> {
    this.logger.debug(`🧠 Calculando Fator R para empresa ${companyId}`);
    // Nota técnica: O UseCase deve retornar dados que satisfaçam o FactorRResponseDto
    return await this.calculateFactorRUseCase.execute(companyId);
  }
}
