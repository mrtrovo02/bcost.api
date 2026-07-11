'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { BillingEntitlementsController } from './billing-entitlements.controller.js';
import { BillingEntitlementsService } from './billing-entitlements.service.js';

/**
 * BillingModule
 *
 * Núcleo SaaS de planos, limites e feature flags.
 *
 * Fase 3.4:
 * - Sem migrations.
 * - Usa Company.planLevel e Company.settings.
 * - Expõe entitlements para frontend.
 * - Permite upgrade/downgrade auditável.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BillingEntitlementsController],
  providers: [BillingEntitlementsService],
  exports: [BillingEntitlementsService],
})
export class BillingModule {}
