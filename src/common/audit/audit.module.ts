import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditProducer } from './audit.producer.js';
import { AuditProcessor } from './audit.processor.js';
import { AUDIT_QUEUE } from './audit.constants.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: AUDIT_QUEUE,
    }),
  ],
  providers: [AuditProducer, AuditProcessor],
  exports: [AuditProducer],
})
export class AuditModule {}
