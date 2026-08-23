'use strict';

import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';
import { TaxScenariosService } from './tax-scenarios.service.js';

@ApiTags('Tax Scenarios')
@ApiBearerAuth()
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
  ) {
    const companyId = body.companyId ?? companyIdHeader;

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
