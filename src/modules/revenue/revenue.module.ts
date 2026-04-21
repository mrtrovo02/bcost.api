'use strict';

import { Module } from '@nestjs/common';
import { RevenueService } from './revenue.service.js';
import { RevenueController } from './revenue.controller.js';
import { RevenueRepository } from './repositories/revenue.repository.js'; // 👈 Verifique esta importação
import { CalculateFactorRUseCase } from './use-cases/calculate-factor-r.use-case.js';
import { CloseMonthUseCase } from './use-cases/close-month.use-case.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [RevenueController],
  providers: [
    RevenueService,
    RevenueRepository, // 👈 O NestJS precisa disso para resolver o CalculateFactorRUseCase
    CalculateFactorRUseCase,
    CloseMonthUseCase,
  ],
  exports: [RevenueService, RevenueRepository], // Exportamos ambos para uso em outros módulos
})
export class RevenueModule {}
