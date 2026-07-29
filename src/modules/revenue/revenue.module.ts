import { Module } from '@nestjs/common';

import { RevenueService } from './revenue.service.js';
import { RevenueController } from './revenue.controller.js';
import { RevenueCompatibilityController } from './revenue-compatibility.controller.js';

import { PrismaModule } from '../../database/prisma.module.js';

// ✅ REPOSITORY
import { RevenueRepository } from './repositories/revenue.repository.js';

// ✅ USE CASES
import { CalculateFactorRUseCase } from './use-cases/calculate-factor-r.use-case.js';
import { CloseMonthUseCase } from './use-cases/close-month.use-case.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    RevenueController,
    RevenueCompatibilityController, // 🔥 Novo Controller de Compatibilidade
  ],
  providers: [
    RevenueService,
    RevenueRepository,
    CalculateFactorRUseCase,
    CloseMonthUseCase,
  ],
  exports: [RevenueService],
})
export class RevenueModule {}
