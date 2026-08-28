'use strict';

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';
import { TaxScenariosService } from './tax-scenarios.service.js';

@ApiTags('Tax Scenarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('tax-scenarios')
export class TaxScenariosController {
  constructor(private readonly service: TaxScenariosService) {}

  @Post('simulate')
  @ApiOperation({
    summary: 'Simular cenário tributário orientativo PF x PJ',
    description:
      'Executa simulação tributária orientativa para triagem comercial e planejamento assistido. Não substitui apuração oficial ou revisão CRC.',
  })
  simulate(
    @Body() body: SimulateTaxScenarioDto,
    @Headers('x-company-id') companyIdHeader?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    const companyId = body.companyId ?? companyIdHeader ?? request?.companyId;

    if (!companyId) {
      throw new BadRequestException(
        'companyId é obrigatório para simulações tributárias autenticadas.',
      );
    }

    const payload: SimulateTaxScenarioDto = {
      ...body,
      companyId,
    };
    const result = this.service.simulate(payload);

    return {
      ...result,
      scenarioId: this.service.scenarioId(payload),
    };
  }
}
