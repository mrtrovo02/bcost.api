import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service.js';
import { AUDIT_QUEUE } from './audit.constants.js';
import { AuditEventPayload } from './audit.types.js';

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AuditEventPayload, void, string>): Promise<void> {
    try {
      const { data } = job;

      // Executa a escrita pesada no PostgreSQL sem travar a API
      await this.prisma.auditLog.create({
        data: {
          action: data.action,
          module: data.module,
          entity: data.entity,
          entityId: data.entityId,
          payload: data.payload || {},
          statusCode: data.statusCode,
          responseTime: data.responseTime,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          userId: data.userId,
          companyId: data.companyId,
        },
      });

      return;
    } catch (error) {
      this.logger.error(`Erro ao processar Job ${job.id}:`, error);
      throw error; // BullMQ tentará novamente com backoff
    }
  }
}
