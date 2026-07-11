'use strict';

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { InsightsService } from './insights.service.js';
import { CompanyCacheInterceptor } from '../common/interceptors/company-cache.interceptor.js';
import { ProjectionItem } from './cash-flow-projection/cash-flow-projection.service.js';

// DTOs para tipagem estrita e documentação OpenAPI
import {
  AnomalyReportDto,
  FinancialHealthDto,
} from './dto/insights-response.dto.js';

/**
 * InsightsController | bCost AI Engine
 * -----------------------------------------------------------------------
 * Camada de orquestração para inteligência financeira e preditiva.
 * Este controller fornece diagnósticos de alto nível para o Cockpit bCost.
 */
@ApiTags('Insights - Inteligência Preditiva')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /**
   * 🏆 EXECUTIVE SUMMARY (CFO VIRTUAL)
   */
  @Get('executive-summary/:companyId')
  @UseInterceptors(CompanyCacheInterceptor)
  @ApiOperation({
    summary: 'Resumo Executivo Consolidado',
    description:
      'Endpoint de elite que retorna o DNA da empresa, tendências de mercado e alertas críticos.',
  })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa no bCost' })
  @ApiResponse({
    status: 200,
    description: 'Diagnóstico 360º processado com sucesso.',
  })
  async getExecutiveSummary(@Param('companyId') companyId: string) {
    return await this.insightsService.getExecutiveSummary(companyId);
  }

  /**
   * ⚡ GATILHO MANUAL (Batch Processing)
   */
  @Post('trigger-batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Processamento em Lote',
    description:
      'Força o recálculo massivo de projeções e auditorias para todas as empresas ativas.',
  })
  @ApiResponse({
    status: 202,
    description: 'Lote enviado para a fila de processamento.',
  })
  async triggerManualBatch() {
    const result = await this.insightsService.runProjectionBatch();
    return {
      message: 'Processamento de lote iniciado com sucesso.',
      timestamp: new Date().toISOString(),
      summary: result,
    };
  }

  /**
   * 🚨 DETECÇÃO DE ANOMALIAS
   */
  @Get('anomalies/:companyId')
  @UseInterceptors(CompanyCacheInterceptor)
  @ApiOperation({ summary: 'Listar Anomalias Estatísticas' })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiResponse({ status: 200, type: [AnomalyReportDto] })
  async getAnomalies(
    @Param('companyId') companyId: string,
  ): Promise<AnomalyReportDto[]> {
    return await this.insightsService.detectAnomalies(companyId);
  }

  /**
   * 📈 PROJEÇÃO DE FLUXO DE CAIXA
   */
  @Get('cash-flow/:companyId')
  @UseInterceptors(CompanyCacheInterceptor)
  @ApiOperation({ summary: 'Projeção Preditiva (90 dias)' })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiResponse({
    status: 200,
    description: 'Time-series de projeção financeira.',
  })
  async getCashFlow(
    @Param('companyId') companyId: string,
  ): Promise<ProjectionItem[]> {
    return await this.insightsService.getCashFlowInsights(companyId);
  }

  /**
   * 🧬 SCORE DE SAÚDE FINANCEIRA
   */
  @Get('health/:companyId')
  @UseInterceptors(CompanyCacheInterceptor)
  @ApiOperation({ summary: 'Score DNA de Saúde' })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiResponse({ status: 200, type: FinancialHealthDto })
  async getFinancialHealth(
    @Param('companyId') companyId: string,
  ): Promise<FinancialHealthDto> {
    return await this.insightsService.getFinancialHealth(companyId);
  }

  /**
   * 🔍 BUSCA SEMÂNTICA (AI Readiness)
   */
  @Get('search/:companyId')
  @ApiOperation({
    summary: 'Interface bCost AI (Busca Semântica)',
    description:
      'Busca vetorial via linguagem natural para análise contextual.',
  })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiQuery({
    name: 'q',
    description: 'Pergunta do usuário (ex: Como reduzir meu imposto?)',
  })
  @ApiResponse({ status: 200, description: 'Contexto semântico para o LLM.' })
  async semanticSearch(
    @Param('companyId') companyId: string,
    @Query('q') query: string,
  ) {
    return await this.insightsService.getSemanticContext(companyId, query);
  }

  // --- 🟢 ADIÇÕES PARA COMPLETAR O CONTROLLER ---

  /**
   * 📉 TENDÊNCIAS HISTÓRICAS
   */
  @Get('historical-trends/:companyId')
  @UseInterceptors(CompanyCacheInterceptor)
  @ApiOperation({
    summary: 'Histórico de Evolução Financeira',
    description:
      'Recupera a série histórica de snapshots para construção de gráficos.',
  })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Quantidade de meses (default: 12)',
  })
  @ApiResponse({ status: 200, description: 'Série histórica recuperada.' })
  async getHistoricalTrends(
    @Param('companyId') companyId: string,
    @Query('limit') limit?: number,
  ) {
    return await this.insightsService.getHistoricalTrends(
      companyId,
      limit ? Number(limit) : 12,
    );
  }

  /**
   * 🎯 STATUS FISCAL E COMPLIANCE
   */
  @Get('tax-compliance/:companyId')
  @ApiOperation({
    summary: 'Status de Compliance Fiscal',
    description:
      'Verifica obrigações e impostos pendentes para alerta no resumo executivo.',
  })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiResponse({ status: 200, description: 'Diagnóstico fiscal processado.' })
  async getTaxCompliance(@Param('companyId') companyId: string) {
    return await this.insightsService.getTaxComplianceStatus(companyId);
  }

  /**
   * ⚡ REFRESH ON-DEMAND
   */
  @Post('refresh/:companyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forçar Atualização de Insights',
    description:
      'Invalida o cache e recalcula todos os indicadores (Saúde, Projeção, Snapshot) imediatamente.',
  })
  @ApiParam({ name: 'companyId', description: 'UUID da empresa' })
  @ApiResponse({
    status: 200,
    description: 'Insights recalculados com sucesso.',
  })
  async refreshInsights(@Param('companyId') companyId: string) {
    return await this.insightsService.refreshCompanyInsights(companyId);
  }
}
