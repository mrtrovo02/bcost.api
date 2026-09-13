import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AUDIT_QUEUE, AUDIT_JOB_PERSIST } from './audit.constants.js';
import { AuditEventPayload } from './audit.types.js';

@Injectable()
export class AuditProducer {
  private readonly logger = new Logger(AuditProducer.name);

  constructor(@InjectQueue(AUDIT_QUEUE) private readonly auditQueue: Queue) {}

  async dispatch(data: AuditEventPayload): Promise<void> {
    try {
      // Adiciona ao Redis em milissegundos, liberando o controller
      await this.auditQueue.add(AUDIT_JOB_PERSIST, data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      });
    } catch (error) {
      this.logger.error('Falha ao enfileirar log de auditoria:', error);
    }
  }
}
