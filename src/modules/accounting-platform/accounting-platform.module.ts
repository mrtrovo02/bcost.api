'use strict';

import { Module } from '@nestjs/common';
import { AccountingPlatformController } from './accounting-platform.controller.js';
import { AccountingPlatformService } from './accounting-platform.service.js';

@Module({
  controllers: [AccountingPlatformController],
  providers: [AccountingPlatformService],
  exports: [AccountingPlatformService],
})
export class AccountingPlatformModule {}
