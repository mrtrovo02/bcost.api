'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { ObligationsEnterpriseController } from './obligations-enterprise.controller.js';
import { ObligationsEnterpriseService } from './obligations-enterprise.service.js';

/**
 * ObligationsEnterpriseModule
 *
 * FASE 3.5.2:
 * - TaxObligation operacional.
 * - FiscalObligation operacional.
 * - Criação, listagem, detalhe, atualização e ações de status.
 * - AuditLog schema-first.
 * - Sem migration.
 * - Base para competir com Domínio, Alterdata, SCI, Contimatic e Contabilizei.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ObligationsEnterpriseController],
  providers: [ObligationsEnterpriseService],
  exports: [ObligationsEnterpriseService],
})
export class ObligationsEnterpriseModule {}
