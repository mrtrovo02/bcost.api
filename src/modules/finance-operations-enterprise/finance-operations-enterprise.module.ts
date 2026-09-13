'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { FinanceOperationsEnterpriseController } from './finance-operations-enterprise.controller.js';
import { FinanceOperationsEnterpriseService } from './finance-operations-enterprise.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [FinanceOperationsEnterpriseController],
  providers: [FinanceOperationsEnterpriseService],
  exports: [FinanceOperationsEnterpriseService],
})
export class FinanceOperationsEnterpriseModule {}
