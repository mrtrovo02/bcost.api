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
  ParseIntPipe,
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

// Guards & Serviços
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { FiscalService } from './fiscal.service.js';
import { ComplianceService } from './compliance/compliance.service.js';
import { DfeService } from './dfe/dfe.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { TaxCalculationService } from './tax/tax-calculation.service.js';
import { ReportService } from './reports/report.service.js';
import { InvoiceService } from './invoices/invoice.service.js';

// DTOs & Decorators
import { UploadXmlDto, XmlDocumentType } from './dto/upload-xml.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';

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

  // --- 1. GESTÃO DE NOTAS FISCAIS ---

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

  // --- 2. INTELIGÊNCIA FINANCEIRA & IMPOSTOS ---

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
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();
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
    @Body('month', ParseIntPipe) month: number,
    @Body('year', ParseIntPipe) year: number,
  ) {
    // 🛡️ Garante que a obrigação fiscal seja criada antes do Snapshot
    const obligation = await this.taxService.closeMonthAndGenerateObligation(
      companyId,
      month,
      year,
      userId,
    );
    const snapshot = await this.fiscalService.generateFinancialSnapshot(
      companyId,
      month,
      year,
    );

    return {
      status: 'closed',
      obligation,
      snapshotId: snapshot.id,
      integrityHash: snapshot.integrityHash,
    };
  }

  // --- 3. AUTOMAÇÃO & SYNC ---

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
    if (!files || files.length === 0)
      throw new BadRequestException('Nenhum arquivo XML detectado.');

    return await this.fiscalService.enqueueXmlUpload(companyId, files, {
      type,
    });
  }

  // --- 4. CONFORMIDADE & PERFORMANCE (O DIFERENCIAL) ---

  @Post('compliance/run-audit/:companyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'CONFORMIDADE: Executar Auditoria Proativa de Malha Fina',
  })
  async runAudit(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    // Chamada ao novo motor de auditoria que corrigimos
    return await this.fiscalService.runComplianceAudit(companyId);
  }

  @Get('optimization/factor-r/:companyId')
  @ApiOperation({ summary: 'ADVISORY: Consultoria de Otimização de Fator R' })
  async getOptimization(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();
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
