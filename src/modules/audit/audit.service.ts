'use strict';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLog } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateAuditLogDto } from './dto/create-audit-log.dto.js';
import { QueryAuditLogDto } from './dto/query-audit-log.dto.js';

type AuditSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;

type AuditLogResponse = {
  id: string | null;
  companyId: string | null;
  userId: string | null;
  module: string;
  action: string;
  entity: string;
  entityId: string | null;
  severity: AuditSeverity;
  source: string;
  statusCode: number | null;
  responseTime: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  payload: Prisma.JsonValue | Record<string, unknown>;
  persisted?: boolean;
  message?: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

type AuditListResult = {
  items: AuditLogResponse[];
  total: number;
  limit: number;
  offset: number;
  generatedAt: string;
  fallback?: boolean;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toDate(value?: string, fieldName = 'date'): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} deve ser uma data válida.`);
    }

    return parsed;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private asRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private normalize(row: AuditLog): AuditLogResponse {
    const payload = this.asRecord(row.payload);
    const metadata = payload;

    return {
      id: row.id,
      companyId: row.companyId ?? null,
      userId: row.userId ?? null,
      module: row.module || 'SYSTEM',
      action: row.action || 'UNKNOWN_ACTION',
      entity: row.entity || 'UNKNOWN_ENTITY',
      entityId: row.entityId ?? null,
      severity:
        typeof payload.severity === 'string' ? payload.severity : 'INFO',
      source:
        typeof payload.source === 'string'
          ? payload.source
          : row.module || 'SYSTEM',
      statusCode: row.statusCode ?? null,
      responseTime: row.responseTime ?? null,
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      metadata,
      payload: row.payload ?? {},
      createdAt: row.createdAt ?? null,
      updatedAt: null,
    };
  }

  private buildWhere(
    companyId: string,
    query: QueryAuditLogDto,
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
    };

    if (query.action) {
      where.action = {
        contains: query.action,
        mode: 'insensitive',
      };
    }

    if (query.module) {
      where.module = {
        contains: query.module,
        mode: 'insensitive',
      };
    }

    if (query.entity) {
      where.entity = {
        contains: query.entity,
        mode: 'insensitive',
      };
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.search) {
      where.OR = [
        { module: { contains: query.search, mode: 'insensitive' } },
        { action: { contains: query.search, mode: 'insensitive' } },
        { entity: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
        { ipAddress: { contains: query.search, mode: 'insensitive' } },
        { userAgent: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const from = this.toDate(query.from, 'from');
    const to = this.toDate(query.to, 'to');

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    return where;
  }

  private resolveModule(dto: CreateAuditLogDto): string {
    const metadataModule =
      dto.metadata &&
      typeof dto.metadata === 'object' &&
      typeof dto.metadata.module === 'string'
        ? dto.metadata.module
        : undefined;

    return String(
      dto.module || metadataModule || dto.source || dto.entity || 'SYSTEM',
    );
  }

  private buildPayload(dto: CreateAuditLogDto): Prisma.InputJsonObject {
    return {
      ...(dto.metadata ?? {}),
      severity: dto.severity ?? 'INFO',
      source: dto.source ?? this.resolveModule(dto),
      manualEvent: true,
    };
  }

  private includesIgnoreCase(value: unknown, expected?: string): boolean {
    if (!expected) return true;

    return String(value ?? '')
      .toLowerCase()
      .includes(String(expected).toLowerCase());
  }

  private equalsIgnoreCase(value: unknown, expected?: string): boolean {
    if (!expected) return true;

    return String(value ?? '').toLowerCase() === String(expected).toLowerCase();
  }

  private matchesAuditQuery(
    item: AuditLogResponse,
    query: QueryAuditLogDto,
  ): boolean {
    if (query.module && !this.equalsIgnoreCase(item.module, query.module)) {
      return false;
    }

    if (query.action && !this.includesIgnoreCase(item.action, query.action)) {
      return false;
    }

    if (query.entity && !this.includesIgnoreCase(item.entity, query.entity)) {
      return false;
    }

    if (
      query.entityId &&
      String(item.entityId ?? '') !== String(query.entityId)
    ) {
      return false;
    }

    if (query.userId && String(item.userId ?? '') !== String(query.userId)) {
      return false;
    }

    if (
      query.severity &&
      !this.equalsIgnoreCase(item.severity, query.severity)
    ) {
      return false;
    }

    if (query.source && !this.includesIgnoreCase(item.source, query.source)) {
      return false;
    }

    if (query.search) {
      const haystack = [
        item.module,
        item.action,
        item.entity,
        item.entityId,
        item.severity,
        item.source,
        item.statusCode,
        item.ipAddress,
        item.userAgent,
        item.metadata ? JSON.stringify(item.metadata) : '',
        item.payload ? JSON.stringify(item.payload) : '',
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(String(query.search).toLowerCase())) {
        return false;
      }
    }

    const from = this.toDate(query.from, 'from');
    const to = this.toDate(query.to, 'to');

    if (from || to) {
      const createdAt = item.createdAt ? new Date(item.createdAt) : null;

      if (!createdAt || Number.isNaN(createdAt.getTime())) {
        return false;
      }

      if (from && createdAt < from) {
        return false;
      }

      if (to && createdAt > to) {
        return false;
      }
    }

    return true;
  }

  async list(
    companyId: string,
    query: QueryAuditLogDto = {},
  ): Promise<AuditListResult> {
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildWhere(companyId, query);
    const fetchLimit = Math.max(limit + offset, 500);

    const rawItems = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      skip: 0,
    });

    const normalized = rawItems.map((row) => this.normalize(row));
    const filtered = normalized.filter((item) =>
      this.matchesAuditQuery(item, query),
    );

    const paged = filtered.slice(offset, offset + limit);

    return {
      items: paged,
      total: filtered.length,
      limit,
      offset,
      generatedAt: new Date().toISOString(),
    };
  }

  async summary(companyId: string) {
    const result = await this.list(companyId, { limit: 500, offset: 0 });
    const items = result.items;

    const bySeverity = items.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.severity || 'INFO');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byEntity = items.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.entity || 'UNKNOWN_ENTITY');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byModule = items.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.module || 'SYSTEM');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      companyId,
      total: result.total,
      last500: items.length,
      bySeverity,
      byEntity,
      byModule,
      latest: items.slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }

  async create(companyId: string, dto: CreateAuditLogDto) {
    const moduleName = this.resolveModule(dto);
    const payload = this.buildPayload(dto);

    const created = await this.prisma.auditLog.create({
      data: {
        companyId,
        userId: dto.userId ?? null,
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        payload,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },
    });

    return this.normalize(created);
  }

  async health(companyId: string) {
    const summary = await this.summary(companyId);

    return {
      companyId,
      module: 'audit',
      status: 'OK',
      total: summary.total,
      latestCount: summary.latest.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async listEnterpriseAuditLogs(
    companyId: string,
    query: {
      limit?: number;
      offset?: number;
      module?: string;
      action?: string;
      entity?: string;
      entityId?: string;
      severity?: string;
      source?: string;
      userId?: string;
      search?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const result = await this.list(companyId, {
      ...query,
      limit: limit + 1,
      offset,
    });
    const sliced = result.items.slice(0, limit);

    const summaryByModule: Record<string, number> = {};
    const summaryByAction: Record<string, number> = {};

    for (const item of sliced) {
      const moduleKey = String(item.module || 'unknown');
      const actionKey = String(item.action || 'unknown');

      summaryByModule[moduleKey] = (summaryByModule[moduleKey] || 0) + 1;
      summaryByAction[actionKey] = (summaryByAction[actionKey] || 0) + 1;
    }

    return {
      companyId,
      status: 'OK',
      items: sliced,
      total: result.total,
      limit,
      offset,
      hasMore: result.items.length > limit,
      summary: {
        count: sliced.length,
        byModule: summaryByModule,
        byAction: summaryByAction,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
