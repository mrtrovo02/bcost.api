'use strict';

import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../../common/guards/tenant-context.guard.js';
import { DfeService } from './dfe.service.js';
import { PrismaService } from '../../../database/prisma.service.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@ApiTags('Fiscal - Inteligência e Automação DFe')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('fiscal/dfe')
export class DfeController {
  constructor(
    private readonly dfeService: DfeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('sync/:companyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincronizar SEFAZ Agora',
    description:
      'Dispara o robô de busca de notas fiscais (NFe/NFSe) para uma empresa específica via Certificado A1.',
  })
  @ApiParam({ name: 'companyId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Processo de sincronização iniciado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Erro na comunicação ou certificado inválido.',
  })
  async syncNow(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    try {
      return await this.dfeService.syncCompanyInvoices(companyId);
    } catch (error: unknown) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Get('status/:companyId')
  @ApiOperation({ summary: 'Verificar Saúde Fiscal' })
  @ApiParam({ name: 'companyId', type: 'string' })
  async getSyncStatus(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        // Incluindo bankAccounts apenas se necessário, conforme seu schema permite
        bankAccounts: true,
      },
    });

    if (!company) throw new BadRequestException('Empresa não encontrada.');

    /**
     * CORREÇÃO DE ATRIBUTO:
     * O erro confirmou que o campo correto é 'cnpj' e não 'document'.
     * Também usamos 'updatedAt' para data de sincronização já que 'lastSyncAt' não existe.
     */
    return {
      companyName: company.name,
      cnpj: company.cnpj, // Alterado de document para cnpj
      taxRegime: company.taxRegime,
      lastUpdate: company.updatedAt,
      status: 'OPERATIONAL',
      hasBankLinked: company.bankAccounts.length > 0,
    };
  }
}
