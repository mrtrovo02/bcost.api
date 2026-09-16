'use strict';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { CreateNotificationEnterpriseDto } from './dto/create-notification-enterprise.dto.js';
import { CreateWebhookEnterpriseDto } from './dto/create-webhook-enterprise.dto.js';
import { DispatchWebhookEventDto } from './dto/dispatch-webhook-event.dto.js';
import { NotificationsEnterpriseQueryDto } from './dto/notifications-enterprise-query.dto.js';
import { UpdateNotificationEnterpriseDto } from './dto/update-notification-enterprise.dto.js';
import { UpdateWebhookEnterpriseDto } from './dto/update-webhook-enterprise.dto.js';
import { NotificationsEnterpriseService } from './notifications-enterprise.service.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller()
export class NotificationsEnterpriseController {
  constructor(private readonly service: NotificationsEnterpriseService) {}

  @Get('notifications/enterprise/summary/:companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.summary(companyId, req.user);
  }

  @Get('notifications/enterprise/:companyId')
  listNotifications(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: NotificationsEnterpriseQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listNotifications(companyId, query, req.user);
  }

  @Post('notifications/enterprise/:companyId')
  createNotification(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateNotificationEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createNotification(companyId, body, req.user);
  }

  @Patch('notifications/enterprise/:companyId/:notificationId')
  updateNotification(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Body() body: UpdateNotificationEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateNotification(
      companyId,
      notificationId,
      body,
      req.user,
    );
  }

  @Post('notifications/enterprise/:companyId/:notificationId/read')
  markRead(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.markNotificationRead(
      companyId,
      notificationId,
      req.user,
    );
  }

  @Post('notifications/enterprise/:companyId/:notificationId/unread')
  markUnread(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.markNotificationUnread(
      companyId,
      notificationId,
      req.user,
    );
  }

  @Post('notifications/enterprise/:companyId/:notificationId/acknowledge')
  acknowledge(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.acknowledgeNotification(
      companyId,
      notificationId,
      req.user,
    );
  }

  @Post('notifications/enterprise/:companyId/:notificationId/archive')
  archive(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.archiveNotification(
      companyId,
      notificationId,
      req.user,
    );
  }

  @Get('webhooks/enterprise/:companyId')
  listWebhooks(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: NotificationsEnterpriseQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listWebhooks(companyId, query, req.user);
  }

  @Post('webhooks/enterprise/:companyId')
  createWebhook(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateWebhookEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createWebhook(companyId, body, req.user);
  }

  @Patch('webhooks/enterprise/:companyId/:webhookId')
  updateWebhook(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('webhookId', new ParseUUIDPipe()) webhookId: string,
    @Body() body: UpdateWebhookEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateWebhook(companyId, webhookId, body, req.user);
  }

  @Post('webhooks/enterprise/:companyId/:webhookId/enable')
  enableWebhook(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('webhookId', new ParseUUIDPipe()) webhookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.setWebhookActive(companyId, webhookId, true, req.user);
  }

  @Post('webhooks/enterprise/:companyId/:webhookId/disable')
  disableWebhook(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('webhookId', new ParseUUIDPipe()) webhookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.setWebhookActive(companyId, webhookId, false, req.user);
  }

  @Post('webhooks/enterprise/:companyId/:webhookId/test')
  testWebhook(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('webhookId', new ParseUUIDPipe()) webhookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.testWebhook(companyId, webhookId, req.user);
  }

  @Post('webhooks/enterprise/:companyId/dispatch')
  dispatchWebhookEvent(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: DispatchWebhookEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.dispatchWebhookEvent(companyId, body, req.user);
  }
}
