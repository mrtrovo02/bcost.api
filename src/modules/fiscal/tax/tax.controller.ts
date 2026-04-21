'use strict';

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiProperty,
} from '@nestjs/swagger';
import { IsUUID, IsNumber, Min } from 'class-validator';
import { TaxService } from './tax.service.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';

/**
 * DTO para simulação de cenários projetados
 */
export class SimulationDto {
  @ApiProperty({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'UUID único da empresa no bCost',
  })
  @IsUUID('4', { message: 'O ID da empresa deve ser um UUID v4 válido.' })
  companyId: string;

  @ApiProperty({
    example: 75000.5,
    description: 'Faturamento mensal projetado para cálculo',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'A receita deve ser um valor numérico.' },
  )
  @Min(0, { message: 'A receita projetada não pode ser negativa.' })
  projectedRevenue: number;
}

@ApiTags('Fiscal - Tax Engine')
@ApiBearerAuth()
@Controller('tax')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calcula impostos mensais',
    description:
      'Processa o RBT12 (Receita Bruta Total) e Fator R para determinar alíquota efetiva.',
  })
  @ApiResponse({ status: 200, description: 'Cálculo processado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Parâmetros de data inválidos.' })
  @ApiResponse({
    status: 404,
    description: 'Empresa não encontrada no banco de dados.',
  })
  @ApiQuery({ name: 'companyId', type: String, format: 'uuid' })
  @ApiQuery({
    name: 'month',
    type: Number,
    example: 2,
    description: 'Mês (1-12)',
  })
  @ApiQuery({
    name: 'year',
    type: Number,
    example: 2026,
    description: 'Ano corrente',
  })
  async calculate(
    @Query('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const m = Number(month);
    const y = Number(year);

    if (m < 1 || m > 12)
      throw new BadRequestException('Mês deve estar entre 1 e 12.');

    return await this.taxService.calculateMonthlyTax(companyId, m, y);
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simula cenário tributário projetado',
    description:
      'Calcula o impacto fiscal de um faturamento sem gerar obrigações reais.',
  })
  @ApiBody({ type: SimulationDto })
  @ApiResponse({ status: 200, description: 'Projeção simulada com sucesso.' })
  async simulate(@Body() data: SimulationDto) {
    return await this.taxService.simulateTaxScenario(
      data.companyId,
      data.projectedRevenue,
    );
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Histórico de performance anual' })
  @ApiQuery({ name: 'companyId', type: String })
  @ApiQuery({ name: 'year', type: Number, example: 2025 })
  @ApiResponse({
    status: 200,
    description: 'Lista de snapshots financeiros do ano.',
  })
  async getHistory(
    @Query('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('year') year: string,
  ) {
    return await this.taxService.getYearlyPerformance(companyId, Number(year));
  }

  @Get('integrity-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Auditoria de integridade',
    description:
      'Verifica se há lacunas de dados nos últimos 12 meses para o cálculo do Simples.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status de prontidão para auditoria fiscal.',
  })
  async checkIntegrity(
    @Query('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    return await this.taxService.validateHistoryIntegrity(companyId);
  }
}
