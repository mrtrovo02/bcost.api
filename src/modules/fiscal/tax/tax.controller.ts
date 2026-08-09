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
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaxService } from './tax.service.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { CbsIbsEngineService } from '../services/cbs-ibs-engine.service.js';
import type {
  NFeIssuePurpose,
  TaxReformTaxType,
} from '../services/cbs-ibs-engine.service.js';
import { TaxReformXmlService } from '../services/tax-reform-xml.service.js';
import { TaxReformParametersService } from '../services/tax-reform-parameters.service.js';
import { TaxRegimeSimulatorService } from '../services/tax-regime-simulator.service.js';
import type { PresumedProfitActivity } from '../services/tax-regime-simulator.service.js';

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

export class RegimeSimulationDto {
  @ApiProperty({ example: 100000, description: 'Receita do período simulado.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  revenue: number;

  @ApiProperty({
    example: 1,
    required: false,
    description: 'Quantidade de meses no período.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  months?: number;

  @ApiProperty({
    example: 4900000,
    required: false,
    description:
      'Receita bruta acumulada no ano-calendário antes do período simulado, usada para aplicar a regra de acréscimo da LC 224/2025 acima de R$ 5 milhões.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  yearToDateRevenueBeforePeriod?: number;

  @ApiProperty({
    example: 30000,
    required: false,
    description: 'Lucro antes dos tributos para simulação do Lucro Real.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  profitBeforeTaxes?: number;

  @ApiProperty({
    example: 'services_general',
    required: false,
    enum: ['services_general', 'commerce_industry'],
  })
  @IsOptional()
  @IsIn(['services_general', 'commerce_industry'])
  presumedActivity?: PresumedProfitActivity;

  @ApiProperty({
    example: 0.05,
    required: false,
    description: 'Alíquota ISS parametrizada.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  issRate?: number;

  @ApiProperty({
    example: 0.18,
    required: false,
    description: 'Alíquota ICMS parametrizada.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  icmsRate?: number;

  @ApiProperty({
    example: 20000,
    required: false,
    description: 'Base de créditos PIS/Cofins não cumulativos no Lucro Real.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pisCofinsCreditBase?: number;
}

class TaxReformDestinationDto {
  @ApiProperty({ example: '35', description: 'Código IBGE da UF de destino.' })
  @IsString()
  @Length(2, 2)
  stateIbgeCode: string;

  @ApiProperty({
    example: '3550308',
    required: false,
    description: 'Código IBGE do município de destino.',
  })
  @IsOptional()
  @IsString()
  @Length(7, 7)
  municipalityIbgeCode?: string;
}

class TaxReformItemDto {
  @ApiProperty({ example: 'item-1' })
  @IsString()
  itemId: string;

  @ApiProperty({ example: 'Serviço de consultoria fiscal', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 100000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseAmount: number;

  @ApiProperty({ example: '000', required: false })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  cstCode?: string;

  @ApiProperty({ example: '000001', required: false })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  cClassTribCode?: string;

  @ApiProperty({ example: '10063021', required: false })
  @IsOptional()
  @IsString()
  ncm?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isNationalBasicBasket?: boolean;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reductionRate?: number;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  legacyTaxAmount?: number;
}

class TaxCreditDto {
  @ApiProperty({ example: 'CBS', enum: ['CBS', 'IBS', 'IS'] })
  @IsIn(['CBS', 'IBS', 'IS'])
  taxType: TaxReformTaxType;

  @ApiProperty({ example: 250 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiProperty({ example: '352601...', required: false })
  @IsOptional()
  @IsString()
  documentKey?: string;
}

class TaxReformRatesDto {
  @ApiProperty({ example: 0.009, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  CBS?: number;

  @ApiProperty({ example: 0.001, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  IBS?: number;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  IS?: number;
}

export class TaxReformSimulationDto {
  @ApiProperty({
    example: 'NORMAL',
    required: false,
    enum: [
      'NORMAL',
      'COMPLEMENTARY',
      'ADJUSTMENT',
      'RETURN',
      'DEBIT_NOTE',
      'CREDIT_NOTE',
    ],
  })
  @IsOptional()
  @IsIn([
    'NORMAL',
    'COMPLEMENTARY',
    'ADJUSTMENT',
    'RETURN',
    'DEBIT_NOTE',
    'CREDIT_NOTE',
  ])
  issuePurpose?: NFeIssuePurpose;

  @ApiProperty({ type: TaxReformDestinationDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaxReformDestinationDto)
  destination?: TaxReformDestinationDto;

  @ApiProperty({ type: [TaxReformItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxReformItemDto)
  items: TaxReformItemDto[];

  @ApiProperty({ type: [TaxCreditDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxCreditDto)
  credits?: TaxCreditDto[];

  @ApiProperty({ type: TaxReformRatesDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaxReformRatesDto)
  rates?: TaxReformRatesDto;
}

export class TaxReformResolvedSimulationDto extends TaxReformSimulationDto {
  @ApiProperty({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    required: false,
  })
  @IsOptional()
  @IsUUID('4')
  companyId?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z', required: false })
  @IsOptional()
  @IsString()
  operationDate?: string;
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
  constructor(
    private readonly taxService: TaxService,
    private readonly cbsIbsEngine: CbsIbsEngineService,
    private readonly taxReformXml: TaxReformXmlService,
    private readonly taxReformParameters: TaxReformParametersService,
    private readonly taxRegimeSimulator: TaxRegimeSimulatorService,
  ) {}

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
  @ApiQuery({ name: 'companyId', type: String })
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

  @Post('simulate-cbs-ibs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simula CBS/IBS e retenção por Split Payment',
    description:
      'Calcula os destaques gerenciais de CBS 0,9% e IBS 0,1% para a fase de teste da Reforma Tributária, incluindo estimativa de caixa líquido se houver retenção no pagamento.',
  })
  @ApiBody({ type: SimulationDto })
  @ApiResponse({
    status: 200,
    description: 'Simulação CBS/IBS processada com sucesso.',
  })
  async simulateCbsIbs(@Body() data: SimulationDto) {
    return this.cbsIbsEngine.calculateTransitionalTax(data.projectedRevenue);
  }

  @Post('simulate-reform-2026')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simula IBS/CBS/IS por item conforme NT 2025.002',
    description:
      'Calcula o Grupo UB para a fase de transição 2026, com destino IBGE, créditos da cadeia anterior, redutores, cesta básica e validação de Nota de Débito/Crédito sem impostos legados.',
  })
  @ApiBody({ type: TaxReformSimulationDto })
  @ApiResponse({
    status: 200,
    description:
      'Simulação detalhada da Reforma Tributária processada com sucesso.',
  })
  async simulateTaxReform2026(@Body() data: TaxReformSimulationDto) {
    return this.cbsIbsEngine.calculateReform2026(data);
  }

  @Get('reform-parameters')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve parâmetros vigentes de CBS/IBS/IS',
    description:
      'Consulta classificação, regra de destino e alíquotas vigentes por data, empresa e códigos CST/cClassTrib. Aplica fallback transitório de 2026 quando a carga oficial ainda não estiver persistida.',
  })
  async getTaxReformParameters(
    @Query('companyId') companyId?: string,
    @Query('operationDate') operationDate?: string,
    @Query('destinationStateIbge') destinationStateIbge?: string,
    @Query('destinationMunicipalityIbge') destinationMunicipalityIbge?: string,
    @Query('cstCode') cstCode?: string,
    @Query('cClassTribCode') cClassTribCode?: string,
  ) {
    return await this.taxReformParameters.resolveParameters({
      companyId,
      operationDate: operationDate ? new Date(operationDate) : undefined,
      destinationStateIbge,
      destinationMunicipalityIbge,
      cstCode,
      cClassTribCode,
    });
  }

  @Post('simulate-reform-2026/resolved')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simula IBS/CBS/IS com parâmetros vigentes do banco',
    description:
      'Resolve alíquotas e classificação fiscal por vigência temporal antes de executar o motor CBS/IBS/IS.',
  })
  @ApiBody({ type: TaxReformResolvedSimulationDto })
  async simulateTaxReform2026Resolved(
    @Body() data: TaxReformResolvedSimulationDto,
  ) {
    const firstItem = data.items?.[0];

    return await this.taxReformParameters.calculateWithResolvedParameters({
      companyId: data.companyId,
      operationDate: data.operationDate
        ? new Date(data.operationDate)
        : undefined,
      destinationStateIbge: data.destination?.stateIbgeCode,
      destinationMunicipalityIbge: data.destination?.municipalityIbgeCode,
      cstCode: firstItem?.cstCode,
      cClassTribCode: firstItem?.cClassTribCode,
      issuePurpose: data.issuePurpose,
      items: data.items,
      credits: data.credits,
    });
  }

  @Post('build-grupo-ub')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gera XML do Grupo UB para IBS/CBS/IS',
    description:
      'Serializa o Grupo UB com tags exclusivas de IBS, CBS e Imposto Seletivo, usando DFeTiposBasicos_v1.00.xsd e validação pré-envio para Notas de Crédito/Débito.',
  })
  @ApiBody({ type: TaxReformSimulationDto })
  @ApiResponse({
    status: 200,
    description: 'Grupo UB serializado com sucesso.',
  })
  async buildGrupoUB(@Body() data: TaxReformSimulationDto) {
    return this.taxReformXml.buildGrupoUB(data);
  }

  @Post('simulate-regimes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simula Lucro Presumido e Lucro Real',
    description:
      'Compara regimes usando regras federais gerais oficiais e alíquotas parametrizadas para ISS/ICMS, créditos e margens.',
  })
  @ApiBody({ type: RegimeSimulationDto })
  @ApiResponse({
    status: 200,
    description: 'Simulação de regimes processada com sucesso.',
  })
  async simulateRegimes(@Body() data: RegimeSimulationDto) {
    return this.taxRegimeSimulator.simulate(data);
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
