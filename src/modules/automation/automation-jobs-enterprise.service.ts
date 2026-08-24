'use strict';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RevenueService } from '../revenue/revenue.service.js';
import { AutomationJobsQueryDto } from './dto/automation-jobs-query.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  companyId?: string;
  [key: string]: unknown;
};

type AutomationAction = 'retry' | 'cancel' | 'acknowledge';

type AutomationActionResult = {
  status: 'OK' | 'OK_WITH_WARNING';
  action: AutomationAction;
  jobId: string;
  companyId: string;
  applied: boolean;
  message: string;
  job: unknown;
  execution?: unknown;
  audit: {
    recorded: boolean;
    error?: string;
  };
  generatedAt: string;
};

@Injectable()
export class AutomationJobsEnterpriseService {
  private readonly logger = new Logger(AutomationJobsEnterpriseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueService: RevenueService,
  ) {}

  private get automationJobModel() {
    const model = (this.prisma as any).automationJob;

    if (!model) {
      throw new NotFoundException(
        'Modelo Prisma automationJob não encontrado.',
      );
    }

    return model;
  }

  private get auditLogModel() {
    return (this.prisma as any).auditLog;
  }

  private normalize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map((item) => this.normalize(item));

    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};

      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = this.normalize(innerValue);
      }

      return output;
    }

    return value;
  }

  private getUserId(user?: AuthUser): string | null {
    return user?.id || user?.sub || null;
  }

  private validateCompanyAccess(companyId: string, user?: AuthUser) {
    const userCompanyId = user?.companyId;
    const role = String(user?.role || '').toUpperCase();

    if (!userCompanyId) return;

    const elevatedRoles = ['SUPER_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'];

    if (userCompanyId !== companyId && !elevatedRoles.includes(role)) {
      throw new ForbiddenException(
        'Acesso negado: empresa do token não corresponde à empresa solicitada.',
      );
    }
  }

  private validateActionPermission(user?: AuthUser) {
    const role = String(user?.role || '').toUpperCase();

    const allowedRoles = [
      'OWNER',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (role && !allowedRoles.includes(role)) {
      throw new ForbiddenException('Ação não permitida para o perfil atual.');
    }
  }

  private toDate(value?: string, field = 'date'): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} inválido.`);
    }

    return parsed;
  }

  private buildWhere(companyId: string, query: AutomationJobsQueryDto) {
    const andConditions: Record<string, unknown>[] = [
      {
        companyId,
      },
    ];

    if (query.status) {
      andConditions.push({
        status: query.status,
      });
    }

    if (query.type) {
      andConditions.push({
        type: query.type,
      });
    }

    if (query.search) {
      andConditions.push({
        OR: [
          {
            name: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            type: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            error: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const from = this.toDate(query.from, 'from');
    const to = this.toDate(query.to, 'to');

    if (from || to) {
      andConditions.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }

    if (andConditions.length === 1) {
      return {
        companyId,
      };
    }

    return {
      AND: andConditions,
    };
  }

  private async findJobById(jobId: string) {
    const model = this.automationJobModel;

    const job = await model.findFirst({
      where: {
        id: jobId,
      },
    });

    if (!job) {
      throw new NotFoundException(`AutomationJob não encontrado: ${jobId}`);
    }

    return job;
  }

  private statusCounts(items: any[]) {
    const counts: Record<string, number> = {};

    for (const item of items) {
      const key = String(item?.status || 'UNKNOWN');
      counts[key] = (counts[key] || 0) + 1;
    }

    return counts;
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    action: string;
    entityId: string;
    severity?: 'INFO' | 'WARN' | 'ERROR' | string;
    source?: string;
    metadata?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  }): Promise<{ recorded: boolean; error?: string }> {
    const auditLog = this.auditLogModel;
    const userId = this.getUserId(params.user);

    if (!auditLog) {
      return {
        recorded: false,
        error: 'Modelo auditLog indisponível.',
      };
    }

    const auditPayload = {
      ...(params.metadata || {}),
      ...(params.payload || {}),
      severity: params.severity || 'INFO',
      source: params.source || 'automation-jobs-enterprise',
      metadata: params.metadata || {},
    };

    const baseData = {
      module: 'automation',
      action: params.action,
      entity: 'AutomationJob',
      entityId: params.entityId,
      statusCode: 200,
      responseTime: null,
      ipAddress: null,
      userAgent: null,
      payload: auditPayload,
    };

    const candidates: Array<{
      label: string;
      data: Record<string, unknown>;
    }> = [
      {
        label: 'scalar-company-user',
        data: {
          companyId: params.companyId,
          userId,
          ...baseData,
        },
      },
      {
        label: 'relation-company-user',
        data: {
          company: {
            connect: {
              id: params.companyId,
            },
          },
          ...(userId
            ? {
                user: {
                  connect: {
                    id: userId,
                  },
                },
              }
            : {}),
          ...baseData,
        },
      },
      {
        label: 'relation-company-no-user',
        data: {
          company: {
            connect: {
              id: params.companyId,
            },
          },
          ...baseData,
        },
      },
      {
        label: 'minimal-relation-company',
        data: {
          company: {
            connect: {
              id: params.companyId,
            },
          },
          action: params.action,
          module: 'automation',
          entity: 'AutomationJob',
          entityId: params.entityId,
          payload: auditPayload,
        },
      },
    ];

    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        await auditLog.create({
          data: candidate.data,
        });

        return {
          recorded: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        errors.push(`[${candidate.label}] ${message}`);
      }
    }

    const compactError =
      errors[errors.length - 1] ||
      errors[0] ||
      'Falha desconhecida ao gravar AuditLog.';

    this.logger.warn(
      `[AutomationJobsEnterprise] Falha ao gravar AuditLog após ${candidates.length} tentativas: ${compactError}`,
    );

    return {
      recorded: false,
      error: compactError,
    };
  }

  private async safeSetStatus(
    jobId: string,
    statuses: string[],
    options?: {
      clearError?: boolean;
      progress?: number;
    },
  ): Promise<{
    applied: boolean;
    job: unknown;
    warning?: string;
  }> {
    const model = this.automationJobModel;
    const errors: string[] = [];

    for (const status of statuses) {
      const updateCandidates: Record<string, unknown>[] = [
        {
          status,
          ...(options?.clearError ? { error: null } : {}),
          ...(typeof options?.progress === 'number'
            ? { progress: options.progress }
            : {}),
          updatedAt: new Date(),
        },
        {
          status,
          ...(options?.clearError ? { error: null } : {}),
          updatedAt: new Date(),
        },
        {
          status,
          updatedAt: new Date(),
        },
        {
          status,
        },
      ];

      for (const data of updateCandidates) {
        try {
          const updated = await model.update({
            where: {
              id: jobId,
            },
            data,
          });

          return {
            applied: true,
            job: updated,
          };
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    const current = await this.findJobById(jobId);

    return {
      applied: false,
      job: current,
      warning:
        errors[0] || 'Não foi possível atualizar status do AutomationJob.',
    };
  }

  private async markJobRunning(jobId: string) {
    const model = this.automationJobModel;

    try {
      return await model.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'RUNNING',
          progress: 10,
          error: null,
          startedAt: new Date(),
          completedAt: null,
          updatedAt: new Date(),
          result: {
            retryStartedAt: new Date().toISOString(),
          },
        },
      });
    } catch {
      return model.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'RUNNING',
          updatedAt: new Date(),
        },
      });
    }
  }

  private async markJobCompleted(jobId: string, result: unknown) {
    const model = this.automationJobModel;

    try {
      return await model.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'COMPLETED',
          progress: 100,
          error: null,
          completedAt: new Date(),
          updatedAt: new Date(),
          result: this.normalize(result) as Prisma.InputJsonValue,
        },
      });
    } catch {
      return model.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'COMPLETED',
          updatedAt: new Date(),
          result: this.normalize(result) as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async markJobFailed(jobId: string, error: unknown, result?: unknown) {
    const model = this.automationJobModel;
    const message = error instanceof Error ? error.message : String(error);

    try {
      return await model.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'FAILED',
          progress: 100,
          error: message,
          completedAt: new Date(),
          updatedAt: new Date(),
          result: {
            error: message,
            ...(result ? { result: this.normalize(result) } : {}),
            failedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      return model.update({
        where: {
          id: jobId,
        },
        data: {
          status: 'FAILED',
          updatedAt: new Date(),
          result: {
            error: message,
            failedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async executeJob(job: any) {
    const type = String(job.type || '').toUpperCase();

    if (type === 'REVENUE_BILLING') {
      const result = await this.revenueService.processMonthlyBilling(
        job.companyId,
        {
          mode: 'AUTOMATION',
          force: false,
          triggeredBy: `automation-job-retry:${job.id}`,
        },
      );

      if (result.status === 'FAILED') {
        throw new Error(
          `Revenue billing retornou FAILED para company=${job.companyId}`,
        );
      }

      return {
        supported: true,
        type,
        engine: 'RevenueService.processMonthlyBilling',
        result,
      };
    }

    return {
      supported: false,
      type: type || 'UNKNOWN',
      message:
        'Tipo de job ainda não possui executor automático nesta fase. Retry registrado apenas para auditoria.',
    };
  }

  async list(
    companyId: string,
    query: AutomationJobsQueryDto = {},
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const model = this.automationJobModel;
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildWhere(companyId, query);

    let rows: any[] = [];
    let usedFallback = false;
    let fallbackReason: string | null = null;

    try {
      rows = await model.findMany({
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

      this.logger.warn(
        `[AutomationJobsEnterprise] Query principal falhou: ${fallbackReason}`,
      );

      rows = await model.findMany({
        where: {
          companyId,
        },
        take: limit + 1,
        skip: offset,
      });
    }

    const sliced = rows.slice(0, limit);

    return {
      status: usedFallback ? 'OK_WITH_FALLBACK' : 'OK',
      module: 'automation-jobs',
      model: 'AutomationJob',
      companyId,
      items: this.normalize(sliced),
      total: offset + sliced.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: {
        count: sliced.length,
        status: this.statusCounts(sliced),
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

  async detail(companyId: string, jobId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const job = await this.findJobById(jobId);

    if (job.companyId !== companyId) {
      throw new ForbiddenException(
        'AutomationJob não pertence à empresa informada.',
      );
    }

    return {
      status: 'OK',
      module: 'automation-jobs',
      model: 'AutomationJob',
      companyId,
      job: this.normalize(job),
      generatedAt: new Date().toISOString(),
    };
  }

  async retry(jobId: string, user?: AuthUser): Promise<AutomationActionResult> {
    this.validateActionPermission(user);

    const current = await this.findJobById(jobId);

    this.validateCompanyAccess(current.companyId, user);

    await this.markJobRunning(jobId);

    let execution: unknown;
    let updatedJob: unknown;
    let applied = false;
    let status: AutomationActionResult['status'] = 'OK';
    let message = 'Retry executado com sucesso.';

    try {
      execution = await this.executeJob(current);

      if (
        execution &&
        typeof execution === 'object' &&
        'supported' in execution &&
        (execution as any).supported === false
      ) {
        status = 'OK_WITH_WARNING';
        message =
          'Retry registrado, mas o tipo de job ainda não possui executor automático.';
        updatedJob = await this.safeSetStatus(jobId, ['QUEUED', 'PENDING'], {
          clearError: false,
          progress: 0,
        }).then((result) => result.job);
      } else {
        updatedJob = await this.markJobCompleted(jobId, execution);
        applied = true;
      }
    } catch (error) {
      status = 'OK_WITH_WARNING';
      message = 'Retry executado, mas o job falhou novamente.';
      updatedJob = await this.markJobFailed(jobId, error, execution);
      applied = false;
    }

    const audit = await this.safeAuditLog({
      companyId: current.companyId,
      user,
      action: 'AUTOMATION_JOB_RETRY_EXECUTED',
      entityId: jobId,
      severity: applied ? 'INFO' : 'WARN',
      metadata: {
        jobId,
        type: current.type,
        previousStatus: current.status,
        applied,
        message,
      },
      payload: {
        action: 'retry',
        jobId,
        previousJob: this.normalize(current) as Record<string, unknown>,
        execution: this.normalize(execution) as Record<string, unknown>,
        applied,
        message,
      },
    });

    return {
      status,
      action: 'retry',
      jobId,
      companyId: current.companyId,
      applied,
      message,
      job: this.normalize(updatedJob),
      execution: this.normalize(execution),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async cancel(
    jobId: string,
    user?: AuthUser,
  ): Promise<AutomationActionResult> {
    this.validateActionPermission(user);

    const current = await this.findJobById(jobId);

    this.validateCompanyAccess(current.companyId, user);

    const update = await this.safeSetStatus(
      jobId,
      ['CANCELLED', 'CANCELED', 'FAILED'],
      {
        progress: 0,
      },
    );

    const audit = await this.safeAuditLog({
      companyId: current.companyId,
      user,
      action: 'AUTOMATION_JOB_CANCEL_REQUESTED',
      entityId: jobId,
      severity: update.applied ? 'INFO' : 'WARN',
      metadata: {
        jobId,
        previousStatus: current.status,
        applied: update.applied,
        warning: update.warning,
      },
      payload: {
        action: 'cancel',
        jobId,
        previousJob: this.normalize(current) as Record<string, unknown>,
      },
    });

    return {
      status: update.applied ? 'OK' : 'OK_WITH_WARNING',
      action: 'cancel',
      jobId,
      companyId: current.companyId,
      applied: update.applied,
      message: update.applied
        ? 'Cancelamento solicitado com sucesso.'
        : 'Cancelamento registrado, mas o status do job não pôde ser atualizado automaticamente.',
      job: this.normalize(update.job),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async acknowledge(
    jobId: string,
    user?: AuthUser,
  ): Promise<AutomationActionResult> {
    this.validateActionPermission(user);

    const current = await this.findJobById(jobId);

    this.validateCompanyAccess(current.companyId, user);

    const audit = await this.safeAuditLog({
      companyId: current.companyId,
      user,
      action: 'AUTOMATION_JOB_ACKNOWLEDGED',
      entityId: jobId,
      severity: 'INFO',
      metadata: {
        jobId,
        currentStatus: current.status,
        acknowledged: true,
      },
      payload: {
        action: 'acknowledge',
        jobId,
        job: this.normalize(current) as Record<string, unknown>,
      },
    });

    return {
      status: audit.recorded ? 'OK' : 'OK_WITH_WARNING',
      action: 'acknowledge',
      jobId,
      companyId: current.companyId,
      applied: audit.recorded,
      message: audit.recorded
        ? 'Job reconhecido e registrado na auditoria.'
        : 'Reconhecimento processado, mas a auditoria não foi gravada.',
      job: this.normalize(current),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }
}
