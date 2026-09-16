'use strict';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { FinanceProcessor } from './processors/finance.processor.js';

/**
 * FinanceModule
 *
 * FIX: NotificationModule e PrismaModule REMOVIDOS dos imports.
 * Ambos são @Global() — disponíveis automaticamente em toda a aplicação.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'finance-queue' })],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceProcessor],
  exports: [FinanceService],
})
export class FinanceModule {}
