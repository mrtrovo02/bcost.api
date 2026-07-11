'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { ComplianceEnterpriseController } from './compliance-enterprise.controller.js';
import { ComplianceEnterpriseService } from './compliance-enterprise.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ComplianceEnterpriseController],
  providers: [ComplianceEnterpriseService],
  exports: [ComplianceEnterpriseService],
})
export class ComplianceEnterpriseModule {}
