'use strict';

import { Module } from '@nestjs/common';
import { CompanyService } from './company.service.js';
import { CompanyController } from './company.controller.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { PrismaModule } from '../../database/prisma.module.js';

/**
 * CompanyModule
 * Focado exclusivamente na gestão de entidades empresariais e clientes.
 * O Dashboard foi movido para um módulo independente para evitar duplicidade de rotas.
 */
@Module({
  imports: [PrismaModule, FiscalModule],
  controllers: [
    CompanyController,
    // 🗑️ DashboardController removido: agora reside no DashboardModule
  ],
  providers: [
    CompanyService,
    // 🗑️ DashboardService removido: agora reside no DashboardModule
  ],
  exports: [CompanyService],
})
export class CompanyModule {}
