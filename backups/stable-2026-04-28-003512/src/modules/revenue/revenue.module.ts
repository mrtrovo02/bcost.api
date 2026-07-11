import { Module } from '@nestjs/common';

import { RevenueService } from './revenue.service.js';
import { RevenueController } from './revenue.controller.js';

import { PrismaModule } from '../../database/prisma.module.js';

// ✅ IMPORT DO REPOSITORY
import { RevenueRepository } from './repositories/revenue.repository.js';

// ✅ USE CASES
import { CalculateFactorRUseCase } from './use-cases/calculate-factor-r.use-case.js';
import { CloseMonthUseCase } from './use-cases/close-month.use-case.js';

@Module({
  imports: [PrismaModule],
  controllers: [RevenueController],
  providers: [
    RevenueService,
    RevenueRepository, // 🔥 FALTAVA ISSO
    CalculateFactorRUseCase,
    CloseMonthUseCase,
  ],
  exports: [RevenueService],
})
export class RevenueModule {}
