'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { BankingEnterpriseController } from './banking-enterprise.controller.js';
import { BankingEnterpriseService } from './banking-enterprise.service.js';

/**
 * BankingEnterpriseModule
 *
 * FASE 3.5.4:
 * - BankAccount enterprise.
 * - BankTransaction enterprise.
 * - Reconciliation sem tabela nova.
 * - Usa BankTransaction.reconciled, invoiceId e taxObligationId.
 * - Gera FinancialEvent quando aplicável.
 * - AuditLog schema-first.
 * - Sem migration.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BankingEnterpriseController],
  providers: [BankingEnterpriseService],
  exports: [BankingEnterpriseService],
})
export class BankingEnterpriseModule {}
