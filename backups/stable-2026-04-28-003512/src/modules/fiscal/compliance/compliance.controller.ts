'use strict';

import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { ComplianceService, ComplianceReport } from './compliance.service.js';

/**
 * ComplianceController: Ponto de controle para auditoria tributária e saúde digital.
 */
@ApiTags('Fiscal - Auditoria & Compliance')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('fiscal/compliance')
export class ComplianceController {
  private readonly logger = new Logger(ComplianceController.name);

  constructor(private readonly complianceService: ComplianceService) {}

  /**
   * Auditoria de Saúde 360° (Cross-Check).
   */
  @Get('health-check/:companyId')
  @ApiOperation({
    summary: 'Auditoria de Saúde 360°',
    description:
      'Executa varredura cross-check: Invoices vs Folha vs Limites Fiscais para gerar o Score de Compliance.',
  })
  @ApiParam({ name: 'companyId', description: 'ID da empresa (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Relatório completo de compliance gerado.',
  })
  async getHealthCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ): Promise<ComplianceReport> {
    this.logger.debug(`Relatório 360 solicitado para empresa: ${companyId}`);
    return await this.complianceService.runFullComplianceAudit(companyId);
  }

  /**
   * Recálculo rápido de Fator R.
   */
  @Post('recalculate-fator-r/:companyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalcular Fator R Manualmente',
    description:
      'Atualiza a janela móvel L12 e verifica elegibilidade ao Anexo III do Simples Nacional.',
  })
  async recalculate(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    const report =
      await this.complianceService.runFullComplianceAudit(companyId);
    return report.fatorR;
  }

  /**
   * Trigger Manual para Auditoria de Certificados Digitais.
   * Útil para o contador validar se o upload de um novo certificado resolveu pendências.
   */
  @Post('audit-certificates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Auditar Certificados (Manual Trigger)',
    description:
      'Força a varredura global de vencimentos de certificados digitais e gera notificações.',
  })
  @ApiResponse({
    status: 200,
    description: 'Auditoria de certificados concluída com sucesso.',
  })
  async triggerCertificateAudit() {
    this.logger.log(
      'Disparo manual de auditoria de certificados iniciado via API.',
    );
    return await this.complianceService.checkCertificatesHealth();
  }
}
