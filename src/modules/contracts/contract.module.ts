'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { ContractService } from './contract.service.js';
import { ContractController } from './contract.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
