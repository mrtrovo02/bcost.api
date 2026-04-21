'use strict';

import {
  Controller,
  Get,
  UseGuards,
  Query,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { DashboardService } from './dashboard.service.js';
import { CashFlowProjectionService } from '../../insights/cash-flow-projection/cash-flow-projection.service.js';
import { AnomalyDetectionService } from '../../insights/anomaly-detection/anomaly-detection.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CompanyRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly cashFlowProjectionService: CashFlowProjectionService,
    private readonly anomalyDetectionService: AnomalyDetectionService,
  ) {}

  @Get('overview')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT, CompanyRole.VIEWER)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300) // 5 minutos de cache (300 segundos)
  @ApiOperation({ summary: 'Métricas consolidadas do Cockpit bCost' })
  @ApiResponse({
    status: 200,
    description: 'Dados do dashboard recuperados com sucesso.',
  })
  async getOverview(@GetUser('companyId') companyId: string) {
    this.logger.log(`📊 Dashboard Overview solicitado: Empresa ${companyId}`);
    return await this.dashboardService.getCompanyOverview(companyId);
  }

  @Get('alerts')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Alertas financeiros e fiscais críticos' })
  async getAlerts(@GetUser('companyId') companyId: string) {
    return await this.dashboardService.getFinancialAlerts(companyId);
  }

  @Get('metrics/real-time')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT, CompanyRole.VIEWER)
  @ApiOperation({
    summary: 'Volume de processamento e provisão de impostos ao vivo',
  })
  async getRealTimeMetrics(@GetUser('companyId') companyId: string) {
    return await this.dashboardService.getRealTimeMetrics(companyId);
  }

  @Get('compliance/diagnostic')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Diagnóstico detalhado de conformidade e riscos' })
  async getCompliance(@GetUser('companyId') companyId: string) {
    return await this.dashboardService.getComplianceDiagnostic(companyId);
  }

  @Get('cash-flow-projection')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT, CompanyRole.VIEWER)
  @ApiOperation({
    summary: 'Projeção de fluxo de caixa (IA)',
    description:
      'Gera uma projeção preditiva baseada em Machine Learning para os próximos dias.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 90 })
  async getCashFlowProjection(
    @GetUser('companyId') companyId: string,
    @Query('days') days?: number,
  ) {
    this.logger.debug(
      `🔮 Gerando projeção de fluxo de caixa para ${days || 90} dias`,
    );
    return this.cashFlowProjectionService.generateProjection(companyId, days);
  }

  @Get('anomalies')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Detecção de anomalias em transações',
    description:
      'Identifica desvios de padrão em transações bancárias e notas fiscais.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  async getAnomalies(
    @GetUser('companyId') companyId: string,
    @Query('days') days?: number,
  ) {
    this.logger.warn(`🔍 Busca por anomalias iniciada: Empresa ${companyId}`);
    return this.anomalyDetectionService.detectAnomalies(companyId, days);
  }
}
