'use strict';

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
  Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiExtraModels,
  ApiConsumes,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { FiscalService } from './fiscal.service.js';
import { ComplianceService } from './compliance/compliance.service.js';
import { DfeService } from './dfe/dfe.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { TaxCalculationService } from './tax/tax-calculation.service.js';
import { ReportService } from './reports/report.service.js';
import { InvoiceService } from './invoices/invoice.service.js';

import { UploadXmlDto, XmlDocumentType } from './dto/upload-xml.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';

function parseOptionalPositiveInt(
  value: unknown,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(
      `${fieldName} deve ser um número inteiro positivo.`,
    );
  }

  return parsed;
}

function currentMonth(): number {
  return new Date().getMonth() + 1;
}

function currentYear(): number {
  return new Date().getFullYear();
}

function nextMonthLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

@ApiTags('Fiscal - Inteligência e Automação')
@ApiBearerAuth('JWT')
@ApiExtraModels(UploadXmlDto, CreateInvoiceDto)
@UseGuards(JwtAuthGuard)
@Controller('fiscal')
export class FiscalController {
  private readonly logger = new Logger(FiscalController.name);

  constructor(
    private readonly fiscalService: FiscalService,
    private readonly complianceService: ComplianceService,
    private readonly dfeService: DfeService,
    private readonly notificationService: NotificationService,
    private readonly taxService: TaxCalculationService,
    private readonly reportService: ReportService,
    private readonly invoiceService: InvoiceService,
  ) {}

  // ---------------------------------------------------------------------------
  // 0. ROTAS DE COMPATIBILIDADE FRONTEND / FISCAL INTELLIGENCE
  // ---------------------------------------------------------------------------

  @Get('diagnostics/:companyId')
  @ApiOperation({
    summary:
      'FISCAL INTELLIGENCE: Diagnóstico consolidado para telas comerciais do frontend',
  })
  async getFiscalDiagnostics(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const targetMonth = parseOptionalPositiveInt(
      month,
      currentMonth(),
      'month',
    );
    const targetYear = parseOptionalPositiveInt(year, currentYear(), 'year');

    this.logger.log(
      `[Fiscal Intelligence] Diagnóstico solicitado: company=${companyId}, month=${targetMonth}, year=${targetYear}`,
    );

    const [syncStatus, projections, factorR, performance, invoices] =
      await Promise.all([
        this.fiscalService.getFiscalSyncStatus(
          companyId,
          targetMonth,
          targetYear,
        ),
        this.fiscalService.getFiscalProjections(companyId),
        this.fiscalService.getFactorROptimization(
          companyId,
          targetMonth,
          targetYear,
        ),
        this.fiscalService.getFiscalPerformance(companyId, targetYear),
        this.fiscalService.getCompanyInvoices(companyId),
      ]);

    const healthScore = Number(syncStatus.healthScore || 0);

    return {
      companyId,
      period: {
        month: targetMonth,
        year: targetYear,
      },
      health: syncStatus,
      projections,
      factorR,
      performance,
      invoicesSummary: {
        total: Array.isArray(invoices) ? invoices.length : 0,
        latest: Array.isArray(invoices) ? invoices.slice(0, 5) : [],
      },
      compliance: {
        status:
          healthScore >= 85
            ? 'VALID'
            : healthScore >= 60
              ? 'WARNING'
              : 'AUDIT_REQUIRED',
        warning: syncStatus.warning,
        lastAudit: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('status/:companyId')
  @ApiOperation({
    summary:
      'FISCAL INTELLIGENCE: Alias de status fiscal para compatibilidade com frontend',
  })
  async getStatusAlias(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const targetMonth = parseOptionalPositiveInt(
      month,
      currentMonth(),
      'month',
    );
    const targetYear = parseOptionalPositiveInt(year, currentYear(), 'year');

    this.logger.log(
      `[Fiscal Intelligence] Status alias solicitado: company=${companyId}, month=${targetMonth}, year=${targetYear}`,
    );

    return await this.fiscalService.getFiscalSyncStatus(
      companyId,
      targetMonth,
      targetYear,
    );
  }

  @Get('sync-status/:companyId')
  @ApiOperation({
    summary:
      'FISCAL INTELLIGENCE: KPIs consolidados de saúde fiscal para o dashboard',
  })
  async getSyncStatus(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const targetMonth = parseOptionalPositiveInt(
      month,
      currentMonth(),
      'month',
    );
    const targetYear = parseOptionalPositiveInt(year, currentYear(), 'year');

    this.logger.log(
      `[Fiscal Intelligence] Sync status solicitado: company=${companyId}, month=${targetMonth}, year=${targetYear}`,
    );

    return await this.fiscalService.getFiscalSyncStatus(
      companyId,
      targetMonth,
      targetYear,
    );
  }

  @Get('performance/:companyId')
  @ApiOperation({
    summary:
      'FISCAL INTELLIGENCE: Série temporal de performance fiscal para gráficos',
  })
  async getPerformance(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('year') year?: string,
  ) {
    const targetYear = parseOptionalPositiveInt(year, currentYear(), 'year');

    this.logger.log(
      `[Fiscal Intelligence] Performance solicitada: company=${companyId}, year=${targetYear}`,
    );

    return await this.fiscalService.getFiscalPerformance(
      companyId,
      targetYear,
    );
  }

  @Get('payroll/:companyId')
  @ApiOperation({
    summary:
      'FISCAL INTELLIGENCE: Alias de diagnóstico de folha/Fator R para frontend',
  })
  async getPayrollAlias(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const targetMonth = parseOptionalPositiveInt(
      month,
      currentMonth(),
      'month',
    );
    const targetYear = parseOptionalPositiveInt(year, currentYear(), 'year');

    this.logger.log(
      `[Fiscal Intelligence] Payroll alias solicitado: company=${companyId}, month=${targetMonth}, year=${targetYear}`,
    );

    const [monthlyTax, factorR] = await Promise.all([
      this.fiscalService.calculateMonthlyTax(
        companyId,
        targetMonth,
        targetYear,
      ),
      this.fiscalService.getFactorROptimization(
        companyId,
        targetMonth,
        targetYear,
      ),
    ]);

    const revenue = Number(monthlyTax.metrics.faturamentoMes || 0);
    const actualPayroll = Number(monthlyTax.metrics.folhaMes || 0);
    const currentFactor = Number(monthlyTax.metrics.fatorR || 0);
    const requiredPayroll = Number((revenue * 0.28).toFixed(2));
    const missingPayroll = Math.max(0, requiredPayroll - actualPayroll);

    return {
      companyId,
      period: {
        month: targetMonth,
        year: targetYear,
      },
      currentFactor,
      requiredPayroll,
      actualPayroll,
      missingPayroll,
      status: currentFactor >= 28 ? 'SAFE' : 'CRITICAL',
      optimized: currentFactor >= 28,
      action:
        currentFactor >= 28
          ? 'Empresa dentro da zona segura para o Fator R.'
          : `Ajuste folha/pró-labore em aproximadamente R$ ${missingPayroll.toFixed(
              2,
            )} para buscar enquadramento no Anexo III.`,
      potentialSaving: Number((factorR as any)?.potentialSaving || 0),
      projection: {
        nextMonth: nextMonthLabel(),
        estimatedSaving: Number((factorR as any)?.potentialSaving || 0),
      },
      source: 'fiscal-payroll-alias',
      generatedAt: new Date().toISOString(),
    };
  }

  @Post('seed-demo/:companyId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'MODO DEMO: Alias compatível para gerar massa de dados fiscais de demonstração',
  })
  async seedDemoCompat(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    return await this.fiscalService.seedDemoData(companyId);
  }

  // ---------------------------------------------------------------------------
  // 1. GESTÃO DE NOTAS FISCAIS
  // ---------------------------------------------------------------------------

  @Post('invoices')
  @ApiOperation({ summary: 'FISCAL: Registro manual de Nota Fiscal' })
  async createInvoice(@Body() dto: CreateInvoiceDto) {
    return await this.invoiceService.create(dto);
  }

  @Get('invoices/:companyId')
  @ApiOperation({ summary: 'AUDITORIA: Listagem das últimas 100 Notas' })
  async listInvoices(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    return await this.fiscalService.getCompanyInvoices(companyId);
  }

  @Delete('invoices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'FISCAL: Remoção Segura (Soft Delete)' })
  async deleteInvoice(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.invoiceService.remove(id);
  }

  // ---------------------------------------------------------------------------
  // 2. INTELIGÊNCIA FINANCEIRA & IMPOSTOS
  // ---------------------------------------------------------------------------

  @Get('analytics/pnl/:companyId')
  @ApiOperation({ summary: 'INTELIGÊNCIA: DRE / PnL em Tempo Real' })
  async getPnL(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.reportService.getRealTimePnL(companyId);
  }

  @Get('analytics/projections/:companyId')
  @ApiOperation({
    summary: 'PREDITIVO: Projeção de impostos baseada em histórico',
  })
  async getProjections(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    return await this.fiscalService.getFiscalProjections(companyId);
  }

  @Get('tax/:companyId')
  @ApiOperation({ summary: 'IMPOSTOS: Cálculo do DAS (Regime de Caixa)' })
  async getMonthlyTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @GetUser('id') userId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const targetMonth = parseOptionalPositiveInt(
      month,
      currentMonth(),
      'month',
    );
    const targetYear = parseOptionalPositiveInt(year, currentYear(), 'year');

    return await this.taxService.calculateSimplesNacional(
      companyId,
      targetMonth,
      targetYear,
      userId,
    );
  }

  @Post('tax/close-month/:companyId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'FECHAMENTO: Encerrar mês e gerar Snapshot Imutável',
  })
  async closeMonth(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @GetUser('id') userId: string,
    @Body('month') month: unknown,
    @Body('year') year: unknown,
  ) {
    const targetMonth = parseOptionalPositiveInt(month, 0, 'month');
    const targetYear = parseOptionalPositiveInt(year, 0, 'year');

    const obligation = await this.taxService.closeMonthAndGenerateObligation(
      companyId,
      targetMonth,
      targetYear,
      userId,
    );

    const snapshot = await this.fiscalService.generateFinancialSnapshot(
      companyId,
      targetMonth,
      targetYear,
    );

    return {
      status: 'closed',
      obligation,
      snapshotId: snapshot.id,
      integrityHash: snapshot.integrityHash,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. AUTOMAÇÃO & SYNC
  // ---------------------------------------------------------------------------

  @Post('sync-dfe/:companyId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'AUTOMAÇÃO: Sincronizar Notas via SEFAZ' })
  async syncDfe(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.dfeService.syncCompanyInvoices(companyId);
  }

  @Post('upload/:companyId')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FilesInterceptor('files', 50))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'AUTOMAÇÃO: Upload em massa de XML (Queue-based)' })
  async uploadXml(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Query('type') type: XmlDocumentType = XmlDocumentType.NFE,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo XML detectado.');
    }

    return await this.fiscalService.enqueueXmlUpload(companyId, files, {
      type,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. CONFORMIDADE & PERFORMANCE
  // ---------------------------------------------------------------------------

  @Post('compliance/run-audit/:companyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'CONFORMIDADE: Executar Auditoria Proativa de Malha Fina',
  })
  async runAudit(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.fiscalService.runComplianceAudit(companyId);
  }

  @Get('optimization/factor-r/:companyId')
  @ApiOperation({ summary: 'ADVISORY: Consultoria de Otimização de Fator R' })
  async getOptimization(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const m = parseOptionalPositiveInt(month, currentMonth(), 'month');
    const y = parseOptionalPositiveInt(year, currentYear(), 'year');

    return await this.fiscalService.getFactorROptimization(companyId, m, y);
  }

  @Post('demo/seed/:companyId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'MODO DEMO: Gerar massa de dados para testes de stress',
  })
  async seedDemo(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.fiscalService.seedDemoData(companyId);
  }
}
