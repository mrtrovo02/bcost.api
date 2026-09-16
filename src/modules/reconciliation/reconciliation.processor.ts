'use strict';

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AutoMatchResult,
  ReconciliationService,
} from './reconciliation.service.js';

@Processor('reconciliation-queue')
export class ReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(private readonly reconciliationService: ReconciliationService) {
    super();
  }

  /**
   * O Worker executa este método fora da thread principal do HTTP.
   */
  async process(job: Job<{ companyId: string }>): Promise<AutoMatchResult> {
    const { companyId } = job.data;
    this.logger.log(
      `[Queue] Iniciando job #${job.id} para Empresa: ${companyId}`,
    );

    // Executa a lógica pesada de Scoring que já construímos
    const result = await this.reconciliationService.runAutoMatch(companyId);

    return result;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`[Queue] Job #${job.id} finalizado com sucesso.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`[Queue] Job #${job.id} falhou: ${error.message}`);
  }
}
