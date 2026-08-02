'use strict';

import {
  Controller,
  Get,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { TaxService } from '../tax/tax.service.js';
import { PayrollService } from '../payroll/payroll.service.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { JwtAuthGuard } from '#auth/guards/jwt-auth.guard.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('fiscal-dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly taxService: TaxService,
    private readonly payrollService: PayrollService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Visão Geral: Consolida Impostos, Fator R e Saúde de Caixa.
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Resumo do dashboard fiscal',
    description:
      'Consolida dados de impostos, fator R e transações pendentes para a empresa no período informado.',
  })
  @ApiQuery({
    name: 'companyId',
    required: true,
    type: 'string',
    description: 'ID da empresa',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: 'number',
    example: 2,
    description: 'Mês (1-12). Se omitido, usa mês atual.',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: 'number',
    example: 2026,
    description: 'Ano. Se omitido, usa ano atual.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados consolidados retornados com sucesso.',
  })
  async getDashboardSummary(
    @Query('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const targetMonth = month ? parseInt(month) : new Date().getUTCMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getUTCFullYear();

    // Low Latency Parallel Execution
    const [taxData, factorR, company, bankStats] = await Promise.all([
      this.taxService.calculateMonthlyTax(companyId, targetMonth, targetYear),
      this.payrollService.getFactorRDiagnostics(
        companyId,
        targetMonth,
        targetYear,
      ),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, taxRegime: true },
      }),
      this.prisma.bankTransaction.aggregate({
        where: { companyId, reconciled: false },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      company: {
        name: company?.name,
        regime: company?.taxRegime,
      },
      period: `${String(targetMonth).padStart(2, '0')}/${targetYear}`,
      taxation: {
        impostoAPagar: taxData.financial.impostoAPagar,
        aliquotaEfetiva: taxData.metrics.aliqEfetiva,
        faturamentoMes: taxData.metrics.faturamentoMes,
        anexoUtilizado: taxData.metrics.anexoUtilizado,
      },
      optimization: {
        fatorR: factorR.diagnostico.fatorR,
        isEligibleAnexoIII: factorR.diagnostico.isEligibleAnexoIII,
        gapSalarial: factorR.diagnostico.valorNecessarioParaAtingir28,
        insight: factorR.insight,
      },
      compliance: {
        transacoesPendentes: bankStats._count,
        volumeNaoConciliado: Number(bankStats._sum?.amount || 0),
        divergenciaBancaria: taxData.compliance.divergenciaBancaria,
      },
      yearlyTrend: await this.taxService.getYearlyPerformance(
        companyId,
        targetYear,
      ),
    };
  }

  /**
   * KPI de Performance de Faturamento vs Lucro Estimado
   * RESOLVE TS2339: Removido filtro por 'status' inexistente.
   */
  @Get('performance-metrics')
  @ApiOperation({
    summary: 'Métricas de performance anual',
    description:
      'Retorna dados de desempenho de faturamento e lucro para o ano atual.',
  })
  @ApiQuery({
    name: 'companyId',
    required: true,
    type: 'string',
    description: 'ID da empresa',
  })
  @ApiResponse({ status: 200, description: 'Métricas retornadas com sucesso.' })
  async getPerformanceMetrics(
    @Query('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    const year = new Date().getUTCFullYear();
    const performance = await this.taxService.getYearlyPerformance(
      companyId,
      year,
    );

    return {
      year,
      // CORREÇÃO TÉCNICA: O retorno do TaxService não tem .status.
      // Mapeamos para garantir integridade caso o frontend espere o campo.
      metrics: performance.map((p) => ({
        ...p,
        status: 'ok', // Injetamos o status manualmente para manter compatibilidade
      })),
    };
  }
}
