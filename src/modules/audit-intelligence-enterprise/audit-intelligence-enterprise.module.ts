'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditIntelligenceEnterpriseController } from './audit-intelligence-enterprise.controller.js';
import { AuditIntelligenceEnterpriseService } from './audit-intelligence-enterprise.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuditIntelligenceEnterpriseController],
  providers: [AuditIntelligenceEnterpriseService],
  exports: [AuditIntelligenceEnterpriseService],
})
export class AuditIntelligenceEnterpriseModule {}
