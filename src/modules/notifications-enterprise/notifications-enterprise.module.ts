'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { NotificationsEnterpriseController } from './notifications-enterprise.controller.js';
import { NotificationsEnterpriseService } from './notifications-enterprise.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsEnterpriseController],
  providers: [NotificationsEnterpriseService],
  exports: [NotificationsEnterpriseService],
})
export class NotificationsEnterpriseModule {}
