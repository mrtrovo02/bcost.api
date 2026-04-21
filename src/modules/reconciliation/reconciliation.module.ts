'use strict';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// Controllers
import { ReconciliationController } from './scoring/reconciliation.controller.js';

// Services & Core
import { ReconciliationService } from './reconciliation.service.js';
import { ReconciliationScoreEngine } from './scoring/reconciliation.score.js';
import { ReconciliationProcessor } from './reconciliation.processor.js';

@Module({
  imports: [
    /**
     * 🚀 CONFIGURAÇÃO DE FILA (BullMQ)
     * Resolve o erro UnknownDependenciesException e garante que o
     * processamento pesado não trave a API.
     */
    BullModule.registerQueue({
      name: 'reconciliation-queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      },
    }),
  ],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationScoreEngine, // Motor de Inteligência (Levenshtein)
    ReconciliationProcessor, // Worker que processa a fila em background
  ],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
