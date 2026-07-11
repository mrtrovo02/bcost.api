import { Module } from '@nestjs/common';
import { BusinessRulesService } from './business-rules.service.js';
import { BusinessRulesController } from './business-rules.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessRulesController],
  providers: [BusinessRulesService],
  exports: [BusinessRulesService],
})
export class BusinessRulesModule {}
