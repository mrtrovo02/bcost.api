'use strict';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import type { NotificationLog, WebhookConfig } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateNotificationEnterpriseDto } from './dto/create-notification-enterprise.dto.js';
import { CreateWebhookEnterpriseDto } from './dto/create-webhook-enterprise.dto.js';
import { DispatchWebhookEventDto } from './dto/dispatch-webhook-event.dto.js';
import { NotificationsEnterpriseQueryDto } from './dto/notifications-enterprise-query.dto.js';
import { UpdateNotificationEnterpriseDto } from './dto/update-notification-enterprise.dto.js';
import { UpdateWebhookEnterpriseDto } from './dto/update-webhook-enterprise.dto.js';
import {
  redactDeep,
  redactSensitiveHeaders,
} from '../../common/security/redact-headers.util.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type WebhookDeliveryResult = {
  webhookId: string;
  url: string;
  event: string;
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  error?: string;
  responsePreview?: string;
};

type EnrichedNotificationLog = Omit<
  NotificationLog,
  'metadata' | 'createdAt' | 'sentAt' | 'readAt' | 'acknowledgedAt'
> & {
  metadata: unknown;
  createdAt: string | null;
  sentAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  operationalStatus: NotificationStatus | 'ACKNOWLEDGED';
};

type EnrichedWebhookConfig = Omit<WebhookConfig, 'secret' | 'createdAt'> & {
  secret?: undefined;
  secretMasked: string | null;
  createdAt: string | null;
  operationalStatus: 'ACTIVE' | 'INACTIVE';
};

type NotificationSummaryItem = Pick<
  NotificationLog,
  'status' | 'severity' | 'channel' | 'read' | 'acknowledged'
>;

type WebhookSummaryItem = Pick<WebhookConfig, 'active' | 'events'>;

@Injectable()
export class NotificationsEnterpriseService {
  private readonly logger = new Logger(NotificationsEnterpriseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get notificationLogModel(): PrismaService['notificationLog'] {
    return this.prisma.notificationLog;
  }

  private get webhookConfigModel(): PrismaService['webhookConfig'] {
    return this.prisma.webhookConfig;
  }

  private get auditLogModel(): PrismaService['auditLog'] {
    return this.prisma.auditLog;
  }

  private getUserId(user?: AuthUser): string | null {
    return user?.id || user?.sub || null;
  }

  private validateCompanyAccess(companyId: string, user?: AuthUser) {
    const tokenCompanyId = user?.companyId;
    const role = String(user?.role || '').toUpperCase();

    if (!tokenCompanyId) return;

    const elevatedRoles = ['SUPER_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'];

    if (tokenCompanyId !== companyId && !elevatedRoles.includes(role)) {
      throw new ForbiddenException(
        'Acesso negado: empresa do token não corresponde à empresa solicitada.',
      );
    }
  }

  private validateWritePermission(user?: AuthUser) {
    const role = String(user?.role || '').toUpperCase();

    if (!role) return;

    const allowedRoles = [
      'OWNER',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'FINANCE',
      'HR',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException(
        'Perfil sem permissão para gerenciar Notifications/Webhooks Enterprise.',
      );
    }
  }

  private normalize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.normalize(item));
    }

    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) {
        out[key] = this.normalize(inner);
      }
      return out;
    }

    return value;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;

    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.toInputJsonValue(item));
    }

    if (this.isPlainRecord(value)) {
      return this.toJsonObject(value);
    }

    return String(value);
  }

  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    if (!this.isPlainRecord(value)) return {};

    const output: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, innerValue] of Object.entries(value)) {
      if (innerValue !== undefined) {
        output[key] = this.toInputJsonValue(innerValue);
      }
    }

    return output as Prisma.InputJsonObject;
  }

  private async findCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
    });

    if (!company) {
      throw new NotFoundException(`Empresa não encontrada: ${companyId}`);
    }

    return company;
  }

  private maskSecret(secret?: string | null) {
    if (!secret) return null;
    if (secret.length <= 8) return '********';
    return `${secret.slice(0, 4)}****************${secret.slice(-4)}`;
  }

  private enrichNotification(
    notification: NotificationLog,
  ): EnrichedNotificationLog {
    return {
      ...notification,
      createdAt: notification.createdAt
        ? new Date(notification.createdAt).toISOString()
        : null,
      sentAt: notification.sentAt
        ? new Date(notification.sentAt).toISOString()
        : null,
      readAt: notification.readAt
        ? new Date(notification.readAt).toISOString()
        : null,
      acknowledgedAt: notification.acknowledgedAt
        ? new Date(notification.acknowledgedAt).toISOString()
        : null,
      operationalStatus: notification.read
        ? 'READ'
        : notification.acknowledged
          ? 'ACKNOWLEDGED'
          : notification.status,
    };
  }

  private enrichWebhook(webhook: WebhookConfig): EnrichedWebhookConfig {
    return {
      ...webhook,
      secret: undefined,
      secretMasked: this.maskSecret(webhook.secret),
      createdAt: webhook.createdAt
        ? new Date(webhook.createdAt).toISOString()
        : null,
      operationalStatus: webhook.active ? 'ACTIVE' : 'INACTIVE',
    };
  }

  private buildNotificationsWhere(
    companyId: string,
    query: NotificationsEnterpriseQueryDto,
  ): Prisma.NotificationLogWhereInput {
    const and: Prisma.NotificationLogWhereInput[] = [{ companyId }];

    if (query.type) and.push({ type: query.type });
    if (query.channel) and.push({ channel: query.channel });
    if (query.status) and.push({ status: query.status });
    if (query.severity) {
      and.push({ severity: query.severity });
    }

    if (query.read !== undefined) {
      and.push({ read: query.read === 'true' });
    }

    if (query.acknowledged !== undefined) {
      and.push({ acknowledged: query.acknowledged === 'true' });
    }

    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { message: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private buildWebhooksWhere(
    companyId: string,
    query: NotificationsEnterpriseQueryDto,
  ): Prisma.WebhookConfigWhereInput {
    const and: Prisma.WebhookConfigWhereInput[] = [{ companyId }];

    if (query.active !== undefined) {
      and.push({ active: query.active === 'true' });
    }

    if (query.event) {
      and.push({ events: { has: query.event } });
    }

    if (query.search) {
      and.push({
        OR: [
          { url: { contains: query.search, mode: 'insensitive' } },
          { events: { has: query.search } },
        ],
      });
    }

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private buildNotificationSummary(items: NotificationSummaryItem[]) {
    const summary = {
      count: items.length,
      unread: 0,
      read: 0,
      acknowledged: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      retry: 0,
      archived: 0,
      info: 0,
      warning: 0,
      critical: 0,
      websocket: 0,
      webhook: 0,
      email: 0,
      byStatus: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byChannel: {} as Record<string, number>,
      riskScore: 100,
    };

    let penalty = 0;

    for (const item of items) {
      const status = String(item.status || 'PENDING');
      const severity = String(item.severity || 'INFO');
      const channel = String(item.channel || 'WEBSOCKET');

      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;
      summary.byChannel[channel] = (summary.byChannel[channel] || 0) + 1;

      if (item.read) summary.read += 1;
      else summary.unread += 1;

      if (item.acknowledged) summary.acknowledged += 1;

      if (status === 'PENDING') summary.pending += 1;
      if (status === 'SENT') summary.sent += 1;
      if (status === 'FAILED') summary.failed += 1;
      if (status === 'RETRY') summary.retry += 1;
      if (status === 'ARCHIVED') summary.archived += 1;

      if (severity === 'CRITICAL') {
        summary.critical += 1;
        if (!item.read) penalty += 12;
      } else if (severity === 'WARNING') {
        summary.warning += 1;
        if (!item.read) penalty += 6;
      } else {
        summary.info += 1;
        if (!item.read) penalty += 1;
      }

      if (channel === 'WEBHOOK') summary.webhook += 1;
      if (channel === 'WEBSOCKET') summary.websocket += 1;
      if (channel === 'EMAIL') summary.email += 1;
    }

    summary.riskScore = Math.max(0, Math.min(100, 100 - penalty));

    return summary;
  }

  private buildWebhookSummary(items: WebhookSummaryItem[]) {
    const summary = {
      count: items.length,
      active: 0,
      inactive: 0,
      totalEventsSubscribed: 0,
      events: {} as Record<string, number>,
    };

    for (const item of items) {
      if (item.active) summary.active += 1;
      else summary.inactive += 1;

      for (const event of item.events || []) {
        summary.totalEventsSubscribed += 1;
        summary.events[event] = (summary.events[event] || 0) + 1;
      }
    }

    return summary;
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    module: 'notifications' | 'webhooks';
    action: string;
    entity: 'NotificationLog' | 'WebhookConfig';
    entityId?: string | null;
    payload?: Record<string, unknown>;
    statusCode?: number;
  }): Promise<{ recorded: boolean; error?: string }> {
    const auditLog = this.auditLogModel;
    const userId = this.getUserId(params.user);

    if (!auditLog?.create) {
      return {
        recorded: false,
        error: 'auditLog indisponível no PrismaService.',
      };
    }

    const payload = this.toJsonObject({
      ...(params.payload || {}),
      source: 'notifications-enterprise',
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    });

    const baseData = {
      module: params.module,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      payload,
      statusCode: params.statusCode ?? 200,
      responseTime: null,
      ipAddress: null,
      userAgent: null,
    };

    const attempts: Array<{
      label: string;
      data: Prisma.AuditLogUncheckedCreateInput;
    }> = [
      {
        label: 'scalar',
        data: {
          companyId: params.companyId,
          ...(userId ? { userId } : {}),
          ...baseData,
        },
      },
      {
        label: 'minimal',
        data: {
          companyId: params.companyId,
          module: params.module,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          payload,
        },
      },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
      try {
        await auditLog.create({ data: attempt.data });
        return { recorded: true };
      } catch (error) {
        errors.push(
          `[${attempt.label}] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const error = errors.at(-1) || 'Falha desconhecida ao gravar AuditLog.';
    this.logger.warn(`[NotificationsEnterprise] AuditLog skipped: ${error}`);

    return {
      recorded: false,
      error,
    };
  }

  async summary(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const [notifications, webhooks] = await Promise.all([
      this.notificationLogModel.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      this.webhookConfigModel.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);

    return {
      status: 'OK',
      module: 'notifications-webhooks-enterprise-summary',
      companyId,
      notifications: this.buildNotificationSummary(notifications),
      webhooks: this.buildWebhookSummary(webhooks),
      generatedAt: new Date().toISOString(),
    };
  }

  async listNotifications(
    companyId: string,
    query: NotificationsEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.notificationLogModel.findMany({
      where: this.buildNotificationsWhere(companyId, query),
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => {
      return this.enrichNotification(item);
    });

    return {
      status: 'OK',
      module: 'notifications',
      model: 'NotificationLog',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildNotificationSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createNotification(
    companyId: string,
    dto: CreateNotificationEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const created = await this.notificationLogModel.create({
      data: {
        companyId,
        userId: dto.userId ?? null,
        type: dto.type || NotificationType.COMPLIANCE_ISSUE,
        title: dto.title.trim(),
        message: dto.message.trim(),
        channel: dto.channel || NotificationChannel.WEBSOCKET,
        status: dto.status || NotificationStatus.PENDING,
        severity: dto.severity || NotificationSeverity.INFO,
        read: false,
        acknowledged: false,
        metadata: this.toJsonObject({
          ...(dto.metadata || {}),
          source: 'notifications-enterprise',
          createdBy: this.getUserId(user),
        }),
        sentAt:
          dto.status === 'SENT' || dto.channel === 'WEBSOCKET'
            ? new Date()
            : null,
      },
    });

    const item = this.enrichNotification(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'notifications',
      action: 'NOTIFICATION_CREATED',
      entity: 'NotificationLog',
      entityId: created.id,
      payload: { item: this.normalize(item) as Record<string, unknown> },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Notificação criada com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateNotification(
    companyId: string,
    notificationId: string,
    dto: UpdateNotificationEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.notificationLogModel.findFirst({
      where: { id: notificationId, companyId },
    });

    if (!current) {
      throw new NotFoundException(
        `Notificação não encontrada: ${notificationId}`,
      );
    }

    const data: Prisma.NotificationLogUncheckedUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.message !== undefined) data.message = dto.message.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.severity !== undefined) {
      data.severity = dto.severity;
    }

    if (dto.metadata !== undefined) {
      data.metadata = this.toJsonObject({
        ...(this.isPlainRecord(current.metadata) ? current.metadata : {}),
        ...dto.metadata,
      });
    }

    if (dto.read !== undefined) {
      data.read = dto.read;
      data.readAt = dto.read ? new Date() : null;
      if (dto.read) data.status = NotificationStatus.READ;
    }

    if (dto.acknowledged !== undefined) {
      data.acknowledged = dto.acknowledged;
      data.acknowledgedAt = dto.acknowledged ? new Date() : null;
      data.acknowledgedById = dto.acknowledged ? this.getUserId(user) : null;
    }

    const updated = await this.notificationLogModel.update({
      where: { id: notificationId },
      data,
    });

    const item = this.enrichNotification(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'notifications',
      action: 'NOTIFICATION_UPDATED',
      entity: 'NotificationLog',
      entityId: notificationId,
      payload: {
        before: this.normalize(this.enrichNotification(current)) as Record<
          string,
          unknown
        >,
        after: this.normalize(item) as Record<string, unknown>,
      },
    });

    return {
      status: 'OK',
      message: 'Notificação atualizada com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async markNotificationRead(
    companyId: string,
    notificationId: string,
    user?: AuthUser,
  ) {
    return this.updateNotification(
      companyId,
      notificationId,
      { read: true },
      user,
    );
  }

  async markNotificationUnread(
    companyId: string,
    notificationId: string,
    user?: AuthUser,
  ) {
    return this.updateNotification(
      companyId,
      notificationId,
      { read: false, status: NotificationStatus.PENDING },
      user,
    );
  }

  async acknowledgeNotification(
    companyId: string,
    notificationId: string,
    user?: AuthUser,
  ) {
    return this.updateNotification(
      companyId,
      notificationId,
      { acknowledged: true, read: true },
      user,
    );
  }

  async archiveNotification(
    companyId: string,
    notificationId: string,
    user?: AuthUser,
  ) {
    return this.updateNotification(
      companyId,
      notificationId,
      { status: NotificationStatus.ARCHIVED, read: true },
      user,
    );
  }

  async listWebhooks(
    companyId: string,
    query: NotificationsEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.webhookConfigModel.findMany({
      where: this.buildWebhooksWhere(companyId, query),
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => {
      return this.enrichWebhook(item);
    });

    return {
      status: 'OK',
      module: 'webhooks',
      model: 'WebhookConfig',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildWebhookSummary(rows.slice(0, limit)),
      generatedAt: new Date().toISOString(),
    };
  }

  async createWebhook(
    companyId: string,
    dto: CreateWebhookEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const events = Array.from(
      new Set(dto.events.map((event) => event.trim()).filter(Boolean)),
    );

    if (events.length === 0) {
      throw new BadRequestException('Informe pelo menos um evento de webhook.');
    }

    const created = await this.webhookConfigModel.create({
      data: {
        companyId,
        url: dto.url.trim(),
        events,
        secret: dto.secret || randomBytes(32).toString('hex'),
        active: dto.active ?? true,
      },
    });

    const item = this.enrichWebhook(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'webhooks',
      action: 'WEBHOOK_CREATED',
      entity: 'WebhookConfig',
      entityId: created.id,
      payload: { item: this.normalize(item) as Record<string, unknown> },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Webhook criado com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateWebhook(
    companyId: string,
    webhookId: string,
    dto: UpdateWebhookEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.webhookConfigModel.findFirst({
      where: { id: webhookId, companyId },
    });

    if (!current) {
      throw new NotFoundException(`Webhook não encontrado: ${webhookId}`);
    }

    const data: Prisma.WebhookConfigUpdateInput = {};

    if (dto.url !== undefined) data.url = dto.url.trim();

    if (dto.events !== undefined) {
      const events = Array.from(
        new Set(dto.events.map((event) => event.trim()).filter(Boolean)),
      );

      if (events.length === 0) {
        throw new BadRequestException(
          'Informe pelo menos um evento de webhook.',
        );
      }

      data.events = events;
    }

    if (dto.secret !== undefined) data.secret = dto.secret;
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.webhookConfigModel.update({
      where: { id: webhookId },
      data,
    });

    const item = this.enrichWebhook(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'webhooks',
      action: 'WEBHOOK_UPDATED',
      entity: 'WebhookConfig',
      entityId: webhookId,
      payload: {
        before: this.normalize(this.enrichWebhook(current)) as Record<
          string,
          unknown
        >,
        after: this.normalize(item) as Record<string, unknown>,
      },
    });

    return {
      status: 'OK',
      message: 'Webhook atualizado com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async setWebhookActive(
    companyId: string,
    webhookId: string,
    active: boolean,
    user?: AuthUser,
  ) {
    return this.updateWebhook(companyId, webhookId, { active }, user);
  }

  private buildWebhookPayload(params: {
    companyId: string;
    webhook: WebhookConfig;
    event: string;
    severity: NotificationSeverity;
    title: string;
    message: string;
    payload?: Record<string, unknown>;
  }) {
    return {
      id: randomBytes(16).toString('hex'),
      source: 'bcost',
      product: 'bCost Enterprise',
      companyId: params.companyId,
      event: params.event,
      severity: params.severity,
      title: params.title,
      message: params.message,
      payload: params.payload || {},
      generatedAt: new Date().toISOString(),
      webhookId: params.webhook.id,
    };
  }

  private signPayload(secret: string, rawBody: string) {
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  private async deliverWebhook(params: {
    companyId: string;
    webhook: WebhookConfig;
    event: string;
    severity: NotificationSeverity;
    title: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<WebhookDeliveryResult> {
    const started = Date.now();
    const body = this.buildWebhookPayload(params);
    const rawBody = JSON.stringify(redactDeep(body));
    const signature = this.signPayload(params.webhook.secret, rawBody);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(params.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'bcost-webhook/1.0',
          'X-BCost-Event': params.event,
          'X-BCost-Company-Id': params.companyId,
          'X-BCost-Webhook-Id': params.webhook.id,
          'X-BCost-Signature-256': `sha256=${signature}`,
        },
        body: rawBody,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const text = await response.text().catch(() => '');

      return {
        webhookId: params.webhook.id,
        url: params.webhook.url,
        event: params.event,
        ok: response.ok,
        statusCode: response.status,
        responseTimeMs: Date.now() - started,
        responsePreview: text.slice(0, 500),
      };
    } catch (error) {
      return {
        webhookId: params.webhook.id,
        url: params.webhook.url,
        event: params.event,
        ok: false,
        statusCode: null,
        responseTimeMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async recordWebhookDeliveryNotification(params: {
    companyId: string;
    event: string;
    result: WebhookDeliveryResult;
    severity: NotificationSeverity;
    user?: AuthUser;
  }) {
    const ok = params.result.ok;

    return this.notificationLogModel.create({
      data: {
        companyId: params.companyId,
        userId: this.getUserId(params.user),
        type: NotificationType.COMPLIANCE_ISSUE,
        title: ok
          ? `Webhook entregue: ${params.event}`
          : `Falha no webhook: ${params.event}`,
        message: ok
          ? `Webhook ${params.result.webhookId} entregue com HTTP ${params.result.statusCode}.`
          : `Webhook ${params.result.webhookId} falhou: ${params.result.error || `HTTP ${params.result.statusCode}`}.`,
        channel: NotificationChannel.WEBHOOK,
        status: ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
        severity: ok ? NotificationSeverity.INFO : params.severity,
        read: false,
        acknowledged: false,
        sentAt: ok ? new Date() : null,
        metadata: this.toJsonObject({
          source: 'webhooks-enterprise',
          event: params.event,
          delivery: this.normalize(params.result),
        }),
      },
    });
  }

  async dispatchWebhookEvent(
    companyId: string,
    dto: DispatchWebhookEventDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const event = dto.event.trim();
    const severity = (dto.severity ||
      NotificationSeverity.INFO) as NotificationSeverity;
    const title = dto.title || `Evento bCost: ${event}`;
    const message = dto.message || `Evento ${event} disparado pelo bCost.`;

    const webhooks = await this.webhookConfigModel.findMany({
      where: {
        companyId,
        active: true,
        events: { has: event },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const results: WebhookDeliveryResult[] = [];
    const deliveryLogs: EnrichedNotificationLog[] = [];

    for (const webhook of webhooks) {
      const result = await this.deliverWebhook({
        companyId,
        webhook,
        event,
        severity,
        title,
        message,
        payload: dto.payload || {},
      });

      results.push(result);

      const log = await this.recordWebhookDeliveryNotification({
        companyId,
        event,
        result,
        severity,
        user,
      });

      deliveryLogs.push(this.enrichNotification(log));
    }

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'webhooks',
      action: 'WEBHOOK_EVENT_DISPATCHED',
      entity: 'WebhookConfig',
      entityId: companyId,
      payload: {
        event,
        matchedWebhooks: webhooks.length,
        delivered: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
        results: this.normalize(results),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Evento de webhook processado.',
      companyId,
      event,
      totals: {
        matchedWebhooks: webhooks.length,
        delivered: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
      },
      results: this.normalize(results),
      deliveryLogs: this.normalize(deliveryLogs),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async testWebhook(companyId: string, webhookId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const webhook = await this.webhookConfigModel.findFirst({
      where: { id: webhookId, companyId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook não encontrado: ${webhookId}`);
    }

    const result = await this.deliverWebhook({
      companyId,
      webhook,
      event: 'webhook.test',
      severity: NotificationSeverity.INFO,
      title: 'Teste de webhook bCost',
      message: 'Evento de teste enviado pelo bCost Enterprise.',
      payload: {
        test: true,
        requestedBy: this.getUserId(user),
      },
    });

    const deliveryLog = await this.recordWebhookDeliveryNotification({
      companyId,
      event: 'webhook.test',
      result,
      severity: result.ok
        ? NotificationSeverity.INFO
        : NotificationSeverity.WARNING,
      user,
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'webhooks',
      action: 'WEBHOOK_TEST_EXECUTED',
      entity: 'WebhookConfig',
      entityId: webhookId,
      payload: { result: this.normalize(result) as Record<string, unknown> },
      statusCode: result.ok ? 200 : 502,
    });

    return {
      status: result.ok ? 'OK' : 'FAILED',
      message: result.ok
        ? 'Webhook testado com sucesso.'
        : 'Webhook testado, mas a entrega falhou.',
      companyId,
      result: this.normalize(result),
      deliveryLog: this.normalize(this.enrichNotification(deliveryLog)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }
}
