'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { FinanceOperationsEnterpriseModule } from '../finance-operations-enterprise/finance-operations-enterprise.module.js';
import { AuditIntelligenceEnterpriseModule } from '../audit-intelligence-enterprise/audit-intelligence-enterprise.module.js';
import { CommandCenterEnterpriseController } from './command-center-enterprise.controller.js';
import { CommandCenterEnterpriseService } from './command-center-enterprise.service.js';

@Module({
  imports: [FinanceOperationsEnterpriseModule, PrismaModule, AuditIntelligenceEnterpriseModule],
  controllers: [CommandCenterEnterpriseController],
  providers: [CommandCenterEnterpriseService],
  exports: [CommandCenterEnterpriseService],
})
export class CommandCenterEnterpriseModule {}
