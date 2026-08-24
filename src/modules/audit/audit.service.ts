'use strict';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateAuditLogDto } from './dto/create-audit-log.dto.js';
import { QueryAuditLogDto } from './dto/query-audit-log.dto.js';

type AuditListResult = {
  items: unknown[];
  total: number;
  limit: number;
  offset: number;
  generatedAt: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get auditModel() {
    const prismaAny = this.prisma as any;

    return (
      prismaAny.auditLog ??
      prismaAny.auditLogs ??
      prismaAny.auditEvent ??
      prismaAny.extended?.auditLog ??
      null
    );
  }

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

  private normalize(row: any) {
    const payload: Record<string, unknown> =
      row.payload && typeof row.payload === 'object' ? row.payload : {};
    const metadata: Record<string, unknown> =
      row.metadata && typeof row.metadata === 'object' ? row.metadata : payload;

    return {
      id: row.id,
      companyId: row.companyId ?? row.company?.id ?? null,
      userId: row.userId ?? row.user?.id ?? null,
      module: row.module ?? row.source ?? 'SYSTEM',
      action: row.action ?? row.event ?? row.type ?? 'UNKNOWN_ACTION',
      entity: row.entity ?? row.resource ?? row.model ?? 'UNKNOWN_ENTITY',
      entityId: row.entityId ?? row.resourceId ?? null,
      severity: row.severity ?? payload.severity ?? row.level ?? 'INFO',
      source: row.source ?? payload.source ?? row.module ?? 'SYSTEM',
      statusCode: row.statusCode ?? null,
      responseTime: row.responseTime ?? null,
      ipAddress: row.ipAddress ?? row.ip ?? null,
      userAgent: row.userAgent ?? null,
      metadata,
      payload: row.payload ?? row.metadata ?? row.details ?? {},
      createdAt: row.createdAt ?? row.timestamp ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }

  private buildWhere(companyId: string, query: QueryAuditLogDto) {
    const where: Record<string, unknown> = {
      companyId,
    };

    if (query.action) {
      where.action = {
        contains: query.action,
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

  private buildPayload(dto: CreateAuditLogDto) {
    return {
      ...(dto.metadata ?? {}),
      severity: dto.severity ?? 'INFO',
      source: dto.source ?? this.resolveModule(dto),
      manualEvent: true,
    };
  }

  private async tryCreate(model: any, data: Record<string, unknown>) {
    const created = await model.create({ data });
    return this.normalize(created);
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

  private matchesAuditQuery(item: any, query: QueryAuditLogDto): boolean {
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
    const model = this.auditModel;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);

    if (!model?.findMany) {
      return {
        items: [],
        total: 0,
        limit,
        offset,
        generatedAt: new Date().toISOString(),
      };
    }

    /**
     * Estratégia enterprise:
     * 1. Tenta query avançada no Prisma.
     * 2. Se houver drift entre schema/Prisma Client, cai para query simples por empresa.
     * 3. Normaliza todos os registros.
     * 4. Aplica filtros em memória para garantir semântica correta.
     *
     * Isso evita 422/500 e garante que ?module=automation retorne somente automation.
     */
    const where = this.buildWhere(companyId, query);

    let rawItems: any[] = [];
    let usedFallback = false;

    const fetchLimit = Math.max(limit + offset, 500);

    try {
      rawItems = await model.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        skip: 0,
      });
    } catch (error) {
      usedFallback = true;

      this.logger.warn(
        `[Audit] Falha ao consultar logs com filtros avançados: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      try {
        rawItems = await model.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          take: fetchLimit,
          skip: 0,
        });
      } catch (fallbackError) {
        this.logger.warn(
          `[Audit] Fallback por companyId falhou: ${
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError)
          }`,
        );

        try {
          rawItems = await model.findMany({
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            skip: 0,
          });
        } catch {
          rawItems = [];
        }
      }
    }

    const normalized = Array.isArray(rawItems)
      ? rawItems.map((row) => this.normalize(row))
      : [];

    const companyFiltered = normalized.filter(
      (item: any) => String(item.companyId || '') === String(companyId),
    );

    const filtered = companyFiltered.filter((item: any) =>
      this.matchesAuditQuery(item, query),
    );

    const paged = filtered.slice(offset, offset + limit);

    return {
      items: paged,
      total: filtered.length,
      limit,
      offset,
      generatedAt: new Date().toISOString(),
      ...(usedFallback
        ? {
            fallback: true,
          }
        : {}),
    } as AuditListResult & { fallback?: boolean };
  }

  async summary(companyId: string) {
    const result = await this.list(companyId, { limit: 500, offset: 0 });
    const items = result.items as any[];

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
    const model = this.auditModel;
    const moduleName = this.resolveModule(dto);
    const payload = this.buildPayload(dto);

    if (!model?.create) {
      return {
        id: null,
        companyId,
        userId: dto.userId ?? null,
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        severity: dto.severity ?? 'INFO',
        source: dto.source ?? moduleName,
        payload,
        metadata: payload,
        persisted: false,
        message:
          'Modelo AuditLog ainda não está disponível no Prisma Client. Evento retornado sem persistência.',
        createdAt: new Date().toISOString(),
      };
    }

    const candidates: Record<string, unknown>[] = [
      {
        company: {
          connect: {
            id: companyId,
          },
        },
        ...(dto.userId
          ? {
              user: {
                connect: {
                  id: dto.userId,
                },
              },
            }
          : {}),
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        payload,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },

      {
        company: {
          connect: {
            id: companyId,
          },
        },
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        payload,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },

      {
        company: {
          connect: {
            id: companyId,
          },
        },
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        payload,
      },

      {
        companyId,
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        userId: dto.userId ?? null,
        payload,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },

      {
        companyId,
        module: moduleName,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        payload,
      },
    ];

    const errors: string[] = [];

    for (const data of candidates) {
      try {
        return await this.tryCreate(model, data);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    this.logger.error(
      `[Audit] Todas as tentativas de create falharam: ${errors.join(' | ')}`,
    );

    throw new BadRequestException(
      `Não foi possível registrar auditoria após múltiplas estratégias. Último erro: ${
        errors[errors.length - 1] || 'erro desconhecido'
      }`,
    );
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
  private normalizeAuditValue(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeAuditValue(item));
    }

    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};

      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = this.normalizeAuditValue(innerValue);
      }

      return output;
    }

    return value;
  }

  private parseAuditDate(value?: string, field = 'date'): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${field} inválido.`);
    }

    return parsed;
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
    const prismaAny = this.prisma as any;
    const auditLog = prismaAny.auditLog;

    if (!auditLog) {
      return {
        companyId,
        status: 'OK_WITH_FALLBACK',
        items: [],
        total: 0,
        limit: Number(query.limit || 100),
        offset: Number(query.offset || 0),
        hasMore: false,
        summary: {
          count: 0,
          warning: 'Modelo auditLog indisponível no PrismaService.',
        },
        generatedAt: new Date().toISOString(),
      };
    }

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);

    const andConditions: Record<string, unknown>[] = [];

    /**
     * Compatibilidade:
     * - Alguns Prisma Clients aceitam companyId escalar.
     * - Outros exigem relação company: { id }.
     * Para findMany normalmente companyId funciona se o campo escalar existe.
     */
    andConditions.push({
      OR: [{ companyId }, { company: { id: companyId } }],
    });

    if (query.module) andConditions.push({ module: query.module });
    if (query.action) andConditions.push({ action: query.action });
    if (query.entity) andConditions.push({ entity: query.entity });
    if (query.entityId) andConditions.push({ entityId: query.entityId });
    if (query.userId) {
      andConditions.push({
        OR: [{ userId: query.userId }, { user: { id: query.userId } }],
      });
    }

    if (query.search) {
      andConditions.push({
        OR: [
          { action: { contains: query.search, mode: 'insensitive' } },
          { module: { contains: query.search, mode: 'insensitive' } },
          { entity: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const from = this.parseAuditDate(query.from, 'from');
    const to = this.parseAuditDate(query.to, 'to');

    if (from || to) {
      andConditions.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }

    const where = andConditions.length ? { AND: andConditions } : {};

    let rows: any[] = [];
    let usedFallback = false;
    let fallbackReason: string | null = null;

    try {
      rows = await auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit + 1,
        skip: offset,
      });
    } catch (error) {
      usedFallback = true;
      fallbackReason = error instanceof Error ? error.message : String(error);

      rows = await auditLog.findMany({
        take: limit + 1,
        skip: offset,
        orderBy: {
          createdAt: 'desc',
        },
      });
    }

    const normalizedRows = (this.normalizeAuditValue(rows) as unknown[]).filter(
      (item) => {
        if (!item || typeof item !== 'object') return false;

        return this.matchesAuditQuery(
          this.normalize(item),
          query as QueryAuditLogDto,
        );
      },
    );

    const sliced = normalizedRows.slice(0, limit).map((item) =>
      this.normalize(item),
    );

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
      status: usedFallback ? 'OK_WITH_FALLBACK' : 'OK',
      items: sliced,
      total: offset + sliced.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: {
        count: sliced.length,
        byModule: summaryByModule,
        byAction: summaryByAction,
        ...(usedFallback
          ? {
              fallback: true,
              fallbackReason,
            }
          : {}),
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
