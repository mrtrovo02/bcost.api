'use strict';

import { Body, Controller, Post } from '@nestjs/common';
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
  simulate(@Body() body: SimulateTaxScenarioDto) {
    const result = this.service.simulate(body);

    return {
      ...result,
      scenarioId: this.service.scenarioId(body),
    };
  }
}
