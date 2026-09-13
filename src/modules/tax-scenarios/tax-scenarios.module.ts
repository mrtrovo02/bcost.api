'use strict';

import { Module } from '@nestjs/common';
import { TaxScenariosController } from './tax-scenarios.controller.js';
import { TaxScenariosService } from './tax-scenarios.service.js';

@Module({
  controllers: [TaxScenariosController],
  providers: [TaxScenariosService],
  exports: [TaxScenariosService],
})
export class TaxScenariosModule {}
