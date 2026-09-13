'use strict';

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PayrollService } from './payroll.service.js';
import { CreatePayrollDto } from './dto/create-payroll.dto.js';
import { SyncPayrollDto } from './dto/sync-payroll.dto.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { LegacyApiAlias } from '../../../common/decorators/legacy-api-alias.decorator.js';
import { CompanyAccessGuard } from '../../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../../common/guards/tenant-context.guard.js';

@ApiTags('Fiscal - Gestão de Folha & Fator R')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('fiscal/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  /**
   * REGISTRO DE MASSA SALARIAL (UPSERT)
   * CORREÇÃO: Uso de ParseUUIDPipe para garantir que IDs de empresa sejam UUIDs.
   */
  @Post(':companyId')
  @LegacyApiAlias('/payroll/enterprise/payrolls/:companyId')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: 'Registrar ou Atualizar Folha/Pró-labore',
    description:
      'Envia o valor da massa salarial de uma competência. Se já existir registro para o mês/ano, o valor será sobrescrito (Idempotência).',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa no bCost',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados da folha processados com sucesso.',
  })
  @ApiResponse({
    status: 400,
    description: 'Payload inválido ou erro de validação.',
  })
  @ApiResponse({ status: 404, description: 'Empresa não localizada.' })
  async create(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() data: CreatePayrollDto,
  ) {
    return await this.payrollService.createPayrollRecord(companyId, data);
  }

  @Post('sync/:companyId')
  @LegacyApiAlias('/payroll/enterprise/payrolls/:companyId/generate')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: 'Sincronizar folha a partir de ERP externo',
    description:
      'Recebe uma competência de folha de sistema externo e faz upsert idempotente para alimentar Fator R e análises fiscais.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa no bCost',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Folha externa sincronizada com sucesso.',
  })
  async syncExternal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() data: SyncPayrollDto,
  ) {
    return await this.payrollService.syncExternalPayrollRecord(companyId, data);
  }

  /**
   * DASHBOARD: HISTÓRICO E ESTATÍSTICAS
   */
  @Get('history/:companyId')
  @LegacyApiAlias('/payroll/enterprise/payrolls/:companyId')
  @ApiOperation({
    summary: 'Estatísticas e Histórico de Folha',
    description:
      'Recupera os lançamentos dos últimos 12 meses com médias e totais acumulados para gráficos.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Histórico consolidado retornado com sucesso.',
  })
  async getHistory(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.payrollService.getCompanyPayrollHistory(companyId);
  }

  /**
   * BI & INTELIGÊNCIA: DIAGNÓSTICO FATOR R
   * RESOLUÇÃO: Parâmetros Query opcionais com tratamento de defaults para evitar erros 400.
   */
  @Get('diagnostics/:companyId')
  @LegacyApiAlias('/fiscal/tax/monthly-preview/:companyId')
  @ApiOperation({
    summary: 'Diagnóstico de Inteligência: Fator R',
    description:
      'Calcula a relação Folha vs Faturamento dos últimos 12 meses e sugere o melhor Anexo do Simples Nacional.',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID da empresa',
    type: 'string',
  })
  @ApiQuery({
    name: 'month',
    description: 'Mês de apuração (1-12)',
    required: false,
    example: 2,
  })
  @ApiQuery({
    name: 'year',
    description: 'Ano de apuração',
    required: false,
    example: 2026,
  })
  @ApiResponse({
    status: 200,
    description: 'Análise detalhada com insight consultivo.',
    schema: {
      example: {
        competenciaReferencia: '2/2026',
        analise12Meses: {
          faturamentoAcumulado: 150000.0,
          massaSalarialAcumulada: 45000.0,
        },
        diagnostico: {
          fatorR: 30.0,
          isEligibleAnexoIII: true,
          valorNecessarioParaAtingir28: 0,
        },
        insight: '✅ Fator R acima de 28%. Qualificada para o Anexo III.',
      },
    },
  })
  async getDiagnostics(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') monthQuery?: string,
    @Query('year') yearQuery?: string,
  ) {
    // 1. Resolução de Competência (Default: Mês/Ano atual se não provido)
    const now = new Date();
    const month = monthQuery ? parseInt(monthQuery, 10) : now.getMonth() + 1;
    const year = yearQuery ? parseInt(yearQuery, 10) : now.getFullYear();

    // 2. Validação Técnica de Negócio
    if (isNaN(month) || month < 1 || month > 12) {
      throw new BadRequestException('O mês deve estar entre 1 e 12.');
    }
    if (isNaN(year) || year < 2000) {
      throw new BadRequestException('Ano de apuração inválido.');
    }

    return await this.payrollService.getFactorRDiagnostics(
      companyId,
      month,
      year,
    );
  }
}
