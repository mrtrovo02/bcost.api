'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { EnterpriseModulesController } from './enterprise-modules.controller.js';
import { EnterpriseModulesService } from './enterprise-modules.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [EnterpriseModulesController],
  providers: [EnterpriseModulesService],
  exports: [EnterpriseModulesService],
})
export class EnterpriseModulesModule {}
