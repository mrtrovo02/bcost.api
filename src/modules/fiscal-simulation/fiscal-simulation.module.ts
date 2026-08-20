import { Module } from '@nestjs/common';
import { FiscalSimulationController } from './fiscal-simulation.controller.js';
import { FiscalSimulationService } from './fiscal-simulation.service.js';
import { FiscalSimulationRepository } from './fiscal-simulation.repository.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [FiscalSimulationController],
  providers: [FiscalSimulationService, FiscalSimulationRepository],
  exports: [FiscalSimulationService, FiscalSimulationRepository],
})
export class FiscalSimulationModule {}
