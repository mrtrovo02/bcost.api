'use strict';

import { Module } from '@nestjs/common';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module.js';
import { OperationalWorkflowsController } from './operational-workflows.controller.js';
import { OperationalWorkflowsService } from './operational-workflows.service.js';

@Module({
  imports: [ServiceCatalogModule],
  controllers: [OperationalWorkflowsController],
  providers: [OperationalWorkflowsService],
  exports: [OperationalWorkflowsService],
})
export class OperationalWorkflowsModule {}
