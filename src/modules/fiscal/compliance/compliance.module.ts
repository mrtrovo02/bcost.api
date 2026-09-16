'use strict';

import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service.js';
import { PrismaModule } from '../../../database/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
