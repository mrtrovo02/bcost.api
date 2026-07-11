'use strict';

import {
  Controller,
  Get,
  Post,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { FinanceService } from './finance.service.js';
import { JwtAuthGuard } from '#auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '#auth/guards/roles.guard.js';
import { Roles } from '#auth/decorators/roles.decorator.js';
import { CurrentUser } from '#auth/decorators/current-user.decorator.js';

// Compatibilidade total com o seu schema.prisma
import { CompanyRole } from '@prisma/client';

/**
 * FinanceController: Interface para Gestão de Caixa e Conciliação Fiscal.
 * Camada de exposição com proteção RBAC e processamento assíncrono via BullMQ.
 */
@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

  constructor(private readonly financeService: FinanceService) {}

  /**
   * RESUMO DE SAÚDE FINANCEIRA
   * Endpoint de alta performance que consolida saldos e passivos.
   */
  @Get('health-summary')
  @Roles(CompanyRole.OWNER, CompanyRole.MANAGER, CompanyRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Obter resumo de saúde financeira',
    description:
      'Retorna saldo bancário real, passivo tributário pendente e índice de saúde.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cálculos financeiros processados.',
  })
  async getHealthSummary(@CurrentUser() user: { companyId: string }) {
    this.logger.log(
      `[Finance-API] Dashboard solicitado para Empresa: ${user.companyId}`,
    );
    return await this.financeService.getFinancialHealthSummary(user.companyId);
  }

  /**
   * DISPARO DE CONCILIAÇÃO ASSÍNCRONA
   * Delega o match entre transações e guias para o Worker (BullMQ).
   */
  @Post('reconcile')
  @HttpCode(HttpStatus.ACCEPTED) // 202: Indica que a tarefa foi aceita e enfileirada
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Executar motor de conciliação (Assíncrono)',
    description:
      'Inicia o job de conciliação em background e retorna o jobId para acompanhamento.',
  })
  @ApiResponse({
    status: 202,
    description: 'Processo de conciliação enfileirado no BullMQ.',
  })
  async runReconciliation(
    @CurrentUser() user: { id: string; companyId: string },
  ) {
    this.logger.warn(
      `[Finance-API] Conciliação disparada para fila por Usuário: ${user.id}`,
    );

    // Agora usando o método de enfileiramento do Service
    return await this.financeService.enqueueReconciliation(
      user.companyId,
      user.id,
    );
  }

  /**
   * BLOQUEIO DE PERÍODO (Integridade Contábil)
   * Impede alterações em meses já fechados usando a tabela BalanceLock.
   */
  @Post('lock-period')
  @HttpCode(HttpStatus.CREATED)
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Bloquear período contábil (Balance Lock)' })
  @ApiQuery({ name: 'month', type: Number, example: 2 })
  @ApiQuery({ name: 'year', type: Number, example: 2026 })
  async lockPeriod(
    @CurrentUser() user: { id: string; companyId: string },
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    this.logger.log(
      `[Finance-API] Bloqueio solicitado para o período ${m}/${y}`,
    );
    return await this.financeService.lockFinancialPeriod(
      user.companyId,
      m,
      y,
      user.id,
    );
  }

  /**
   * TRILHA DE AUDITORIA
   * Recupera logs de ações financeiras da tabela AuditLog.
   */
  @Get('audit-trail')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Ver trilha de auditoria do módulo financeiro' })
  @ApiResponse({
    status: 200,
    description: 'Lista de ações de auditoria retornada.',
  })
  async getFinanceAudit(@CurrentUser() user: { companyId: string }) {
    return await this.financeService.getModuleAuditTrail(
      user.companyId,
      'FINANCE',
    );
  }
}
