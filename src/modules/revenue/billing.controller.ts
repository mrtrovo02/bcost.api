'use strict';

import { Controller, Post, UseGuards } from '@nestjs/common';
import { CompanyRole } from '@prisma/client';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ContractService } from '../contracts/contract.service.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '#auth/guards/jwt-auth.guard.js';
import { RequiresFeature } from '../billing/decorators/requires-feature.decorator.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@RequiresFeature('revenue.billing')
export class BillingController {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Endpoint para disparar o faturamento manual dos contratos do dia.
   */
  @Post('run-cycle')
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Executar ciclo de faturamento',
    description:
      'Dispara o processamento manual de faturas para contratos que vencem no dia atual.',
  })
  @ApiOkResponse({ description: 'Ciclo de faturamento executado com sucesso.' })
  @ApiUnauthorizedResponse({ description: 'Usuário não autenticado.' })
  @ApiResponse({ status: 500, description: 'Erro interno no processamento.' })
  async runCycle(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
  ) {
    return this.contractService.runBillingCycle(companyId, userId);
  }
}
