'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AccountingEnterpriseController } from './accounting-enterprise.controller.js';
import { AccountingEnterpriseService } from './accounting-enterprise.service.js';

/**
 * AccountingEnterpriseModule
 *
 * FASE 3.5.3:
 * - AccountPlan operacional.
 * - AccountingEntry operacional.
 * - BalanceLock operacional.
 * - Valida conta débito/crédito.
 * - Bloqueia alteração em período fechado.
 * - AuditLog schema-first.
 * - Sem migration.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AccountingEnterpriseController],
  providers: [AccountingEnterpriseService],
  exports: [AccountingEnterpriseService],
})
export class AccountingEnterpriseModule {}
