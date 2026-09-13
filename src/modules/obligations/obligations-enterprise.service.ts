'use strict';

import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FiscalObligationStatus,
  FiscalObligationType,
  ObligationStatus,
  Prisma,
} from '@prisma/client';
import type { FiscalObligation, TaxObligation } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateFiscalObligationDto } from './dto/create-fiscal-obligation.dto.js';
import { CreateTaxObligationDto } from './dto/create-tax-obligation.dto.js';
import { QueryObligationsDto } from './dto/query-obligations.dto.js';
import { RegisterTaxEvidenceDto } from './dto/register-tax-evidence.dto.js';
import { SubmitFiscalObligationDto } from './dto/submit-fiscal-obligation.dto.js';
import { UpdateFiscalObligationDto } from './dto/update-fiscal-obligation.dto.js';
import { UpdateTaxObligationDto } from './dto/update-tax-obligation.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type TaxOperationalStatus =
  | 'PENDING'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'PARTIAL';

type FiscalOperationalStatus =
  | 'PENDING'
  | 'GENERATED'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'OVERDUE';

type TaxObligationRecord = TaxObligation;
type FiscalObligationRecord = FiscalObligation;

type EnrichedTaxObligation = Omit<
  TaxObligationRecord,
  'amount' | 'dueDate' | 'createdAt'
> & {
  amount: number;
  dueDate: string;
  createdAt: string | null;
  operationalStatus: TaxOperationalStatus;
  daysToDue: number | null;
  overdue: boolean;
  paid: boolean;
  cancelled: boolean;
};

type EnrichedFiscalObligation = Omit<
  FiscalObligationRecord,
  'dueDate' | 'submittedAt' | 'createdAt' | 'updatedAt'
> & {
  dueDate: string;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  operationalStatus: FiscalOperationalStatus;
  daysToDue: number | null;
  overdue: boolean;
  submitted: boolean;
  accepted: boolean;
  rejected: boolean;
};

@Injectable()
export class ObligationsEnterpriseService {
  private readonly logger = new Logger(ObligationsEnterpriseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get taxModel(): PrismaService['taxObligation'] {
    return this.prisma.taxObligation;
  }

  private get fiscalModel(): PrismaService['fiscalObligation'] {
    return this.prisma.fiscalObligation;
  }

  private get auditLogModel(): PrismaService['auditLog'] {
    return this.prisma.auditLog;
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

  private validateWritePermission(user?: AuthUser) {
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
      throw new ForbiddenException(
        'Perfil sem permissão para gerenciar obrigações fiscais.',
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
      const output: Record<string, unknown> = {};

      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = this.normalize(innerValue);
      }

      return output;
    }

    return value;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof Prisma.Decimal)
    );
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null) return null;
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

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} inválido.`);
    }

    return parsed;
  }

  private daysUntil(date: Date): number {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

  private getTaxOperationalStatus(
    item: TaxObligationRecord,
  ): TaxOperationalStatus {
    const status = String(item.status || 'PENDING').toUpperCase();

    if (status === 'PAID') return 'PAID';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'PARTIAL') return 'PARTIAL';

    const dueDate = new Date(item.dueDate);

    if (!Number.isNaN(dueDate.getTime()) && dueDate < new Date()) {
      return 'OVERDUE';
    }

    return status as TaxOperationalStatus;
  }

  private getFiscalOperationalStatus(
    item: FiscalObligationRecord,
  ): FiscalOperationalStatus {
    const status = String(item.status || 'PENDING').toUpperCase();

    if (status === 'ACCEPTED') return 'ACCEPTED';
    if (status === 'REJECTED') return 'REJECTED';
    if (status === 'SUBMITTED') return 'SUBMITTED';

    const dueDate = new Date(item.dueDate);

    if (!Number.isNaN(dueDate.getTime()) && dueDate < new Date()) {
      return 'OVERDUE';
    }

    return status as FiscalOperationalStatus;
  }

  private enrichTax(item: TaxObligationRecord): EnrichedTaxObligation {
    const dueDate = new Date(item.dueDate);
    const operationalStatus = this.getTaxOperationalStatus(item);
    const daysToDue = Number.isNaN(dueDate.getTime())
      ? null
      : this.daysUntil(dueDate);

    return {
      ...item,
      dueDate: dueDate.toISOString(),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      amount:
        item.amount instanceof Prisma.Decimal
          ? item.amount.toNumber()
          : item.amount,
      operationalStatus,
      daysToDue,
      overdue: operationalStatus === 'OVERDUE',
      paid: operationalStatus === 'PAID',
      cancelled: operationalStatus === 'CANCELLED',
    };
  }

  private enrichFiscal(item: FiscalObligationRecord): EnrichedFiscalObligation {
    const dueDate = new Date(item.dueDate);
    const submittedAt = item.submittedAt ? new Date(item.submittedAt) : null;
    const operationalStatus = this.getFiscalOperationalStatus(item);
    const daysToDue = Number.isNaN(dueDate.getTime())
      ? null
      : this.daysUntil(dueDate);

    return {
      ...item,
      dueDate: dueDate.toISOString(),
      submittedAt: submittedAt ? submittedAt.toISOString() : null,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
      operationalStatus,
      daysToDue,
      overdue: operationalStatus === 'OVERDUE',
      submitted: operationalStatus === 'SUBMITTED',
      accepted: operationalStatus === 'ACCEPTED',
      rejected: operationalStatus === 'REJECTED',
    };
  }

  private buildTaxWhere(companyId: string, query: QueryObligationsDto) {
    const andConditions: Record<string, unknown>[] = [{ companyId }];

    if (query.status && query.status !== 'ALL') {
      andConditions.push({ status: query.status });
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
            fileUrl: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (query.from || query.to) {
      const dueDate: Record<string, Date> = {};

      if (query.from) dueDate.gte = this.parseDate(query.from, 'from');
      if (query.to) dueDate.lte = this.parseDate(query.to, 'to');

      andConditions.push({ dueDate });
    }

    return andConditions.length === 1 ? { companyId } : { AND: andConditions };
  }

  private buildFiscalWhere(companyId: string, query: QueryObligationsDto) {
    const andConditions: Record<string, unknown>[] = [{ companyId }];

    if (query.status && query.status !== 'ALL') {
      andConditions.push({ status: query.status });
    }

    if (query.type && query.type !== 'ALL') {
      andConditions.push({ type: query.type });
    }

    if (query.month) {
      andConditions.push({ referenceMonth: query.month });
    }

    if (query.year) {
      andConditions.push({ referenceYear: query.year });
    }

    if (query.search) {
      andConditions.push({
        OR: [
          {
            fileUrl: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            fileHash: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            receiptCode: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (query.from || query.to) {
      const dueDate: Record<string, Date> = {};

      if (query.from) dueDate.gte = this.parseDate(query.from, 'from');
      if (query.to) dueDate.lte = this.parseDate(query.to, 'to');

      andConditions.push({ dueDate });
    }

    return andConditions.length === 1 ? { companyId } : { AND: andConditions };
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    module: 'tax-obligations' | 'fiscal-obligations';
    action: string;
    entity: 'TaxObligation' | 'FiscalObligation';
    entityId?: string | null;
    payload?: Record<string, unknown>;
    statusCode?: number | null;
  }): Promise<{ recorded: boolean; error?: string }> {
    const userId = this.getUserId(params.user);

    const payload = this.toJsonObject({
      ...(params.payload || {}),
      source: 'obligations-enterprise',
      severity: params.statusCode && params.statusCode >= 400 ? 'WARN' : 'INFO',
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

    const candidates: Array<{
      label: string;
      data: Prisma.AuditLogUncheckedCreateInput;
    }> = [
      {
        label: 'scalar-schema-first',
        data: {
          companyId: params.companyId,
          ...(userId ? { userId } : {}),
          ...baseData,
        },
      },
      {
        label: 'scalar-minimal',
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

    for (const candidate of candidates) {
      try {
        await this.auditLogModel.create({
          data: candidate.data,
        });

        return {
          recorded: true,
        };
      } catch (error) {
        errors.push(
          `[${candidate.label}] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const lastError =
      errors[errors.length - 1] ||
      errors[0] ||
      'Falha desconhecida ao gravar AuditLog.';

    this.logger.warn(`[ObligationsEnterprise] AuditLog skipped: ${lastError}`);

    return {
      recorded: false,
      error: lastError,
    };
  }

  private buildTaxSummary(items: EnrichedTaxObligation[]) {
    const summary = {
      count: items.length,
      pending: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
      partial: 0,
      totalAmount: 0,
      pendingAmount: 0,
      overdueAmount: 0,
      nextDue: null as null | {
        id: string;
        name: string;
        dueDate: string;
        amount: number;
        daysToDue: number | null;
      },
      status: {} as Record<string, number>,
    };

    for (const item of items) {
      const status = String(item.status || 'PENDING');
      const operationalStatus = String(item.operationalStatus || status);
      const amount = Number(item.amount || 0);

      summary.status[status] = (summary.status[status] || 0) + 1;
      summary.totalAmount += amount;

      if (operationalStatus === 'PENDING') {
        summary.pending += 1;
        summary.pendingAmount += amount;
      }

      if (operationalStatus === 'PAID') summary.paid += 1;

      if (operationalStatus === 'OVERDUE') {
        summary.overdue += 1;
        summary.overdueAmount += amount;
      }

      if (operationalStatus === 'CANCELLED') summary.cancelled += 1;
      if (operationalStatus === 'PARTIAL') summary.partial += 1;

      if (
        !['PAID', 'CANCELLED'].includes(operationalStatus) &&
        item.dueDate &&
        (!summary.nextDue ||
          new Date(item.dueDate).getTime() <
            new Date(summary.nextDue.dueDate).getTime())
      ) {
        summary.nextDue = {
          id: item.id,
          name: item.name,
          dueDate: item.dueDate,
          amount,
          daysToDue: item.daysToDue,
        };
      }
    }

    return summary;
  }

  private buildFiscalSummary(items: EnrichedFiscalObligation[]) {
    const summary = {
      count: items.length,
      pending: 0,
      generated: 0,
      submitted: 0,
      accepted: 0,
      rejected: 0,
      overdue: 0,
      nextDue: null as null | {
        id: string;
        type: string;
        referenceMonth: number;
        referenceYear: number;
        dueDate: string;
        daysToDue: number | null;
      },
      status: {} as Record<string, number>,
      type: {} as Record<string, number>,
    };

    for (const item of items) {
      const status = String(item.status || 'PENDING');
      const type = String(item.type || 'UNKNOWN');
      const operationalStatus = String(item.operationalStatus || status);

      summary.status[status] = (summary.status[status] || 0) + 1;
      summary.type[type] = (summary.type[type] || 0) + 1;

      if (operationalStatus === 'PENDING') summary.pending += 1;
      if (operationalStatus === 'GENERATED') summary.generated += 1;
      if (operationalStatus === 'SUBMITTED') summary.submitted += 1;
      if (operationalStatus === 'ACCEPTED') summary.accepted += 1;
      if (operationalStatus === 'REJECTED') summary.rejected += 1;
      if (operationalStatus === 'OVERDUE') summary.overdue += 1;

      if (
        !['ACCEPTED', 'REJECTED'].includes(operationalStatus) &&
        item.dueDate &&
        (!summary.nextDue ||
          new Date(item.dueDate).getTime() <
            new Date(summary.nextDue.dueDate).getTime())
      ) {
        summary.nextDue = {
          id: item.id,
          type: item.type,
          referenceMonth: item.referenceMonth,
          referenceYear: item.referenceYear,
          dueDate: item.dueDate,
          daysToDue: item.daysToDue,
        };
      }
    }

    return summary;
  }

  async listTax(
    companyId: string,
    query: QueryObligationsDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildTaxWhere(companyId, query);

    const rows = await this.taxModel.findMany({
      where,
      orderBy: {
        dueDate: 'asc',
      },
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => this.enrichTax(item));

    return {
      status: 'OK',
      module: 'tax-obligations',
      model: 'TaxObligation',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildTaxSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async summaryTax(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const rows = await this.taxModel.findMany({
      where: {
        companyId,
      },
      orderBy: {
        dueDate: 'asc',
      },
      take: 1000,
    });

    const items = rows.map((item) => this.enrichTax(item));

    return {
      status: 'OK',
      module: 'tax-obligations',
      model: 'TaxObligation',
      companyId,
      summary: this.buildTaxSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createTax(
    companyId: string,
    dto: CreateTaxObligationDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const dueDate = this.parseDate(dto.dueDate, 'dueDate');

    const created = await this.taxModel.create({
      data: {
        companyId,
        name: dto.name.trim(),
        dueDate,
        amount: dto.amount,
        status: dto.status || ObligationStatus.PENDING,
        fileUrl: dto.fileUrl?.trim() || null,
      },
    });

    const enriched = this.enrichTax(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'tax-obligations',
      action: 'TAX_OBLIGATION_CREATED',
      entity: 'TaxObligation',
      entityId: created.id,
      payload: {
        obligationId: created.id,
        item: this.normalize(enriched),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Obrigação tributária criada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async detailTax(companyId: string, obligationId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const item = await this.taxModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Obrigação tributária não encontrada: ${obligationId}`,
      );
    }

    return {
      status: 'OK',
      module: 'tax-obligations',
      model: 'TaxObligation',
      companyId,
      item: this.normalize(this.enrichTax(item)),
      generatedAt: new Date().toISOString(),
    };
  }

  async updateTax(
    companyId: string,
    obligationId: string,
    dto: UpdateTaxObligationDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.taxModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação tributária não encontrada: ${obligationId}`,
      );
    }

    const data: Record<string, unknown> = {
      version: {
        increment: 1,
      },
    };

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.dueDate !== undefined) {
      data.dueDate = this.parseDate(dto.dueDate, 'dueDate');
    }
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.fileUrl !== undefined) data.fileUrl = dto.fileUrl?.trim() || null;

    const updated = await this.taxModel.update({
      where: {
        id: obligationId,
      },
      data,
    });

    const enriched = this.enrichTax(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'tax-obligations',
      action: 'TAX_OBLIGATION_UPDATED',
      entity: 'TaxObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichTax(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação tributária atualizada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async markTaxAsPaid(
    companyId: string,
    obligationId: string,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.taxModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação tributária não encontrada: ${obligationId}`,
      );
    }

    const updated = await this.taxModel.update({
      where: {
        id: obligationId,
      },
      data: {
        status: ObligationStatus.PAID,
        version: {
          increment: 1,
        },
      },
    });

    const enriched = this.enrichTax(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'tax-obligations',
      action: 'TAX_OBLIGATION_MARKED_AS_PAID',
      entity: 'TaxObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichTax(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação tributária marcada como paga.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async registerTaxEvidence(
    companyId: string,
    obligationId: string,
    dto: RegisterTaxEvidenceDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.taxModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação tributária não encontrada: ${obligationId}`,
      );
    }

    const evidence = {
      obligationId,
      companyId,
      fileUrl: dto.fileUrl.trim(),
      receiptCode: dto.receiptCode.trim(),
      notes: dto.notes?.trim() || null,
      source: 'GOVERNMENT_PORTAL',
      recordedBy: this.getUserId(user),
      recordedAt: new Date().toISOString(),
    };

    const evidenceHash = createHash('sha256')
      .update(JSON.stringify(evidence))
      .digest('hex');

    const updated = await this.taxModel.update({
      where: {
        id: obligationId,
      },
      data: {
        fileUrl: evidence.fileUrl,
        version: {
          increment: 1,
        },
      },
    });

    const enriched = this.enrichTax(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'tax-obligations',
      action: 'TAX_OBLIGATION_OFFICIAL_EVIDENCE_REGISTERED',
      entity: 'TaxObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichTax(current)),
        after: this.normalize(enriched),
        evidence: {
          ...evidence,
          integrityHash: evidenceHash,
        },
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Evidência oficial registrada para a obrigação tributária.',
      companyId,
      item: this.normalize(enriched),
      evidence: {
        ...evidence,
        integrityHash: evidenceHash,
      },
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async cancelTax(companyId: string, obligationId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.taxModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação tributária não encontrada: ${obligationId}`,
      );
    }

    const updated = await this.taxModel.update({
      where: {
        id: obligationId,
      },
      data: {
        status: ObligationStatus.CANCELLED,
        version: {
          increment: 1,
        },
      },
    });

    const enriched = this.enrichTax(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'tax-obligations',
      action: 'TAX_OBLIGATION_CANCELLED',
      entity: 'TaxObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichTax(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação tributária cancelada.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async deleteTax(companyId: string, obligationId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.taxModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação tributária não encontrada: ${obligationId}`,
      );
    }

    await this.taxModel.delete({
      where: {
        id: obligationId,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'tax-obligations',
      action: 'TAX_OBLIGATION_DELETED',
      entity: 'TaxObligation',
      entityId: obligationId,
      payload: {
        deleted: this.normalize(this.enrichTax(current)),
        warning:
          'Exclusão física realizada porque TaxObligation não possui deletedAt no schema atual.',
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação tributária removida com sucesso.',
      companyId,
      deletedId: obligationId,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async listFiscal(
    companyId: string,
    query: QueryObligationsDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildFiscalWhere(companyId, query);

    const rows = await this.fiscalModel.findMany({
      where,
      orderBy: [
        {
          referenceYear: 'desc',
        },
        {
          referenceMonth: 'desc',
        },
        {
          dueDate: 'asc',
        },
      ],
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => this.enrichFiscal(item));

    return {
      status: 'OK',
      module: 'fiscal-obligations',
      model: 'FiscalObligation',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildFiscalSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async summaryFiscal(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const rows = await this.fiscalModel.findMany({
      where: {
        companyId,
      },
      orderBy: [
        {
          referenceYear: 'desc',
        },
        {
          referenceMonth: 'desc',
        },
      ],
      take: 1000,
    });

    const items = rows.map((item) => this.enrichFiscal(item));

    return {
      status: 'OK',
      module: 'fiscal-obligations',
      model: 'FiscalObligation',
      companyId,
      summary: this.buildFiscalSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createFiscal(
    companyId: string,
    dto: CreateFiscalObligationDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const existing = await this.fiscalModel.findFirst({
      where: {
        companyId,
        type: dto.type,
        referenceMonth: dto.referenceMonth,
        referenceYear: dto.referenceYear,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Obrigação fiscal ${dto.type}/${dto.referenceMonth}/${dto.referenceYear} já existe para esta empresa.`,
      );
    }

    const dueDate = this.parseDate(dto.dueDate, 'dueDate');

    const created = await this.fiscalModel.create({
      data: {
        companyId,
        type: dto.type as FiscalObligationType,
        referenceMonth: dto.referenceMonth,
        referenceYear: dto.referenceYear,
        dueDate,
        status: dto.status || FiscalObligationStatus.PENDING,
        fileUrl: dto.fileUrl?.trim() || null,
        fileHash: dto.fileHash?.trim() || null,
        submittedAt: dto.submittedAt
          ? this.parseDate(dto.submittedAt, 'submittedAt')
          : null,
        receiptCode: dto.receiptCode?.trim() || null,
      },
    });

    const enriched = this.enrichFiscal(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'fiscal-obligations',
      action: 'FISCAL_OBLIGATION_CREATED',
      entity: 'FiscalObligation',
      entityId: created.id,
      payload: {
        obligationId: created.id,
        item: this.normalize(enriched),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Obrigação fiscal criada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async detailFiscal(companyId: string, obligationId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const item = await this.fiscalModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Obrigação fiscal não encontrada: ${obligationId}`,
      );
    }

    return {
      status: 'OK',
      module: 'fiscal-obligations',
      model: 'FiscalObligation',
      companyId,
      item: this.normalize(this.enrichFiscal(item)),
      generatedAt: new Date().toISOString(),
    };
  }

  async updateFiscal(
    companyId: string,
    obligationId: string,
    dto: UpdateFiscalObligationDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.fiscalModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação fiscal não encontrada: ${obligationId}`,
      );
    }

    const nextType = dto.type ?? current.type;
    const nextMonth = dto.referenceMonth ?? current.referenceMonth;
    const nextYear = dto.referenceYear ?? current.referenceYear;

    if (
      nextType !== current.type ||
      nextMonth !== current.referenceMonth ||
      nextYear !== current.referenceYear
    ) {
      const duplicated = await this.fiscalModel.findFirst({
        where: {
          companyId,
          type: nextType,
          referenceMonth: nextMonth,
          referenceYear: nextYear,
          NOT: {
            id: obligationId,
          },
        },
      });

      if (duplicated) {
        throw new BadRequestException(
          `Já existe obrigação fiscal ${nextType}/${nextMonth}/${nextYear} para esta empresa.`,
        );
      }
    }

    const data: Record<string, unknown> = {};

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.referenceMonth !== undefined)
      data.referenceMonth = dto.referenceMonth;
    if (dto.referenceYear !== undefined) data.referenceYear = dto.referenceYear;
    if (dto.dueDate !== undefined) {
      data.dueDate = this.parseDate(dto.dueDate, 'dueDate');
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.fileUrl !== undefined) data.fileUrl = dto.fileUrl?.trim() || null;
    if (dto.fileHash !== undefined)
      data.fileHash = dto.fileHash?.trim() || null;
    if (dto.submittedAt !== undefined) {
      data.submittedAt = dto.submittedAt
        ? this.parseDate(dto.submittedAt, 'submittedAt')
        : null;
    }
    if (dto.receiptCode !== undefined) {
      data.receiptCode = dto.receiptCode?.trim() || null;
    }

    const updated = await this.fiscalModel.update({
      where: {
        id: obligationId,
      },
      data,
    });

    const enriched = this.enrichFiscal(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'fiscal-obligations',
      action: 'FISCAL_OBLIGATION_UPDATED',
      entity: 'FiscalObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichFiscal(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação fiscal atualizada com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async submitFiscal(
    companyId: string,
    obligationId: string,
    dto: SubmitFiscalObligationDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.fiscalModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação fiscal não encontrada: ${obligationId}`,
      );
    }

    const updated = await this.fiscalModel.update({
      where: {
        id: obligationId,
      },
      data: {
        status: FiscalObligationStatus.SUBMITTED,
        submittedAt: dto.submittedAt
          ? this.parseDate(dto.submittedAt, 'submittedAt')
          : new Date(),
        receiptCode: dto.receiptCode?.trim() || current.receiptCode,
        fileUrl: dto.fileUrl?.trim() || current.fileUrl,
        fileHash: dto.fileHash?.trim() || current.fileHash,
      },
    });

    const enriched = this.enrichFiscal(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'fiscal-obligations',
      action: 'FISCAL_OBLIGATION_SUBMITTED',
      entity: 'FiscalObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichFiscal(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação fiscal transmitida/submetida com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async acceptFiscal(companyId: string, obligationId: string, user?: AuthUser) {
    return this.setFiscalStatus(
      companyId,
      obligationId,
      FiscalObligationStatus.ACCEPTED,
      'FISCAL_OBLIGATION_ACCEPTED',
      'Obrigação fiscal aceita com sucesso.',
      user,
    );
  }

  async rejectFiscal(companyId: string, obligationId: string, user?: AuthUser) {
    return this.setFiscalStatus(
      companyId,
      obligationId,
      FiscalObligationStatus.REJECTED,
      'FISCAL_OBLIGATION_REJECTED',
      'Obrigação fiscal rejeitada.',
      user,
    );
  }

  private async setFiscalStatus(
    companyId: string,
    obligationId: string,
    status: FiscalObligationStatus,
    action: string,
    message: string,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.fiscalModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação fiscal não encontrada: ${obligationId}`,
      );
    }

    const updated = await this.fiscalModel.update({
      where: {
        id: obligationId,
      },
      data: {
        status,
      },
    });

    const enriched = this.enrichFiscal(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'fiscal-obligations',
      action,
      entity: 'FiscalObligation',
      entityId: obligationId,
      payload: {
        before: this.normalize(this.enrichFiscal(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message,
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async deleteFiscal(companyId: string, obligationId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.fiscalModel.findFirst({
      where: {
        id: obligationId,
        companyId,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `Obrigação fiscal não encontrada: ${obligationId}`,
      );
    }

    await this.fiscalModel.delete({
      where: {
        id: obligationId,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'fiscal-obligations',
      action: 'FISCAL_OBLIGATION_DELETED',
      entity: 'FiscalObligation',
      entityId: obligationId,
      payload: {
        deleted: this.normalize(this.enrichFiscal(current)),
        warning:
          'Exclusão física realizada porque FiscalObligation não possui deletedAt no schema atual.',
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Obrigação fiscal removida com sucesso.',
      companyId,
      deletedId: obligationId,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }
}
