'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { PayrollEnterpriseController } from './payroll-enterprise.controller.js';
import { PayrollEnterpriseService } from './payroll-enterprise.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PayrollEnterpriseController],
  providers: [PayrollEnterpriseService],
  exports: [PayrollEnterpriseService],
})
export class PayrollEnterpriseModule {}
