'use strict';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CertificateStatus, Prisma } from '@prisma/client';
import type { DigitalCertificate } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateDigitalCertificateDto } from './dto/create-digital-certificate.dto.js';
import { QueryDigitalCertificatesDto } from './dto/query-digital-certificates.dto.js';
import { UpdateDigitalCertificateDto } from './dto/update-digital-certificate.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type CertificateOperationalStatus =
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'REVOKED';

type EnrichedDigitalCertificate = Omit<
  DigitalCertificate,
  'validFrom' | 'validTo' | 'createdAt'
> & {
  validFrom: string;
  validTo: string;
  createdAt: string | null;
  operationalStatus: CertificateOperationalStatus;
  daysToExpire: number | null;
  expired: boolean;
  expiringSoon: boolean;
  revoked: boolean;
};

@Injectable()
export class DigitalCertificatesEnterpriseService {
  private readonly logger = new Logger(
    DigitalCertificatesEnterpriseService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  private get certificateModel(): PrismaService['digitalCertificate'] {
    return this.prisma.digitalCertificate;
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
        'Perfil sem permissão para gerenciar certificados digitais.',
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

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} inválido.`);
    }

    return parsed;
  }

  private validatePeriod(validFrom: Date, validTo: Date) {
    if (validTo <= validFrom) {
      throw new BadRequestException('validTo deve ser maior que validFrom.');
    }
  }

  private getOperationalStatus(
    cert: DigitalCertificate,
  ): CertificateOperationalStatus {
    const status = String(cert.status || '').toUpperCase();
    const now = new Date();
    const validTo = new Date(cert.validTo);

    if (status === 'REVOKED') return 'REVOKED';
    if (Number.isNaN(validTo.getTime())) return 'EXPIRED';
    if (validTo < now) return 'EXPIRED';

    const daysToExpire = this.daysUntil(validTo);

    if (daysToExpire <= 30) return 'EXPIRING_SOON';

    return 'VALID';
  }

  private daysUntil(date: Date): number {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  private enrichCertificate(
    cert: DigitalCertificate,
  ): EnrichedDigitalCertificate {
    const validTo = new Date(cert.validTo);
    const validFrom = new Date(cert.validFrom);
    const operationalStatus = this.getOperationalStatus(cert);

    return {
      ...cert,
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      createdAt: cert.createdAt ? new Date(cert.createdAt).toISOString() : null,
      operationalStatus,
      daysToExpire: Number.isNaN(validTo.getTime())
        ? null
        : this.daysUntil(validTo),
      expired: operationalStatus === 'EXPIRED',
      expiringSoon: operationalStatus === 'EXPIRING_SOON',
      revoked: operationalStatus === 'REVOKED',
    };
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

  private async findCertificate(
    companyId: string,
    certificateId: string,
  ): Promise<DigitalCertificate> {
    const certificate = await this.certificateModel.findFirst({
      where: {
        id: certificateId,
        companyId,
      },
    });

    if (!certificate) {
      throw new NotFoundException(
        `Certificado digital não encontrado: ${certificateId}`,
      );
    }

    return certificate;
  }

  private buildWhere(
    companyId: string,
    query: QueryDigitalCertificatesDto,
  ): Prisma.DigitalCertificateWhereInput {
    const andConditions: Prisma.DigitalCertificateWhereInput[] = [
      {
        companyId,
      },
    ];

    if (query.status) {
      andConditions.push({
        status: query.status,
      });
    }

    if (query.search) {
      andConditions.push({
        OR: [
          {
            issuer: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            thumbprint: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            serialNumber: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (query.expiringInDays) {
      const now = new Date();
      const future = new Date();
      future.setUTCDate(future.getUTCDate() + query.expiringInDays);

      andConditions.push({
        validTo: {
          gte: now,
          lte: future,
        },
      });
    }

    return andConditions.length === 1
      ? {
          companyId,
        }
      : {
          AND: andConditions,
        };
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    action: string;
    entityId?: string | null;
    payload?: Record<string, unknown>;
    statusCode?: number | null;
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
      source: 'digital-certificates-enterprise',
      severity: params.statusCode && params.statusCode >= 400 ? 'WARN' : 'INFO',
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    });

    const baseData = {
      module: 'digital-certificates',
      action: params.action,
      entity: 'DigitalCertificate',
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
          module: 'digital-certificates',
          action: params.action,
          entity: 'DigitalCertificate',
          entityId: params.entityId ?? null,
          payload,
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

    this.logger.warn(
      `[DigitalCertificatesEnterprise] AuditLog skipped: ${lastError}`,
    );

    return {
      recorded: false,
      error: lastError,
    };
  }

  async list(
    companyId: string,
    query: QueryDigitalCertificatesDto = {},
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const offset = Math.max(Number(query.offset || 0), 0);
    const where = this.buildWhere(companyId, query);

    const rows = await this.certificateModel.findMany({
      where,
      orderBy: {
        validTo: 'asc',
      },
      take: limit + 1,
      skip: offset,
    });

    const items = rows
      .slice(0, limit)
      .map((item) => this.enrichCertificate(item));

    return {
      status: 'OK',
      module: 'digital-certificates',
      model: 'DigitalCertificate',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.buildSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async summary(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const rows = await this.certificateModel.findMany({
      where: {
        companyId,
      },
      orderBy: {
        validTo: 'asc',
      },
      take: 1000,
    });

    const items = rows.map((item) => this.enrichCertificate(item));
    const summary = this.buildSummary(items);

    return {
      status: 'OK',
      module: 'digital-certificates',
      model: 'DigitalCertificate',
      companyId,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildSummary(items: EnrichedDigitalCertificate[]) {
    const summary = {
      count: items.length,
      active: 0,
      expired: 0,
      revoked: 0,
      expiringSoon: 0,
      valid: 0,
      nextExpiration: null as null | {
        id: string;
        issuer: string;
        validTo: string;
        daysToExpire: number | null;
      },
      status: {} as Record<string, number>,
    };

    for (const item of items) {
      const status = String(item.status || 'UNKNOWN');
      summary.status[status] = (summary.status[status] || 0) + 1;

      if (status === 'ACTIVE') summary.active += 1;
      if (status === 'EXPIRED') summary.expired += 1;
      if (status === 'REVOKED') summary.revoked += 1;

      if (item.operationalStatus === 'VALID') summary.valid += 1;
      if (item.operationalStatus === 'EXPIRING_SOON') {
        summary.expiringSoon += 1;
      }

      if (
        item.status === 'ACTIVE' &&
        item.validTo &&
        (!summary.nextExpiration ||
          new Date(item.validTo).getTime() <
            new Date(summary.nextExpiration.validTo).getTime())
      ) {
        summary.nextExpiration = {
          id: item.id,
          issuer: item.issuer,
          validTo: item.validTo,
          daysToExpire: item.daysToExpire,
        };
      }
    }

    return summary;
  }

  async detail(companyId: string, certificateId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const certificate = await this.findCertificate(companyId, certificateId);

    return {
      status: 'OK',
      module: 'digital-certificates',
      model: 'DigitalCertificate',
      companyId,
      item: this.normalize(this.enrichCertificate(certificate)),
      generatedAt: new Date().toISOString(),
    };
  }

  async create(
    companyId: string,
    dto: CreateDigitalCertificateDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    await this.findCompany(companyId);

    const validFrom = this.parseDate(dto.validFrom, 'validFrom');
    const validTo = this.parseDate(dto.validTo, 'validTo');

    this.validatePeriod(validFrom, validTo);

    const created = await this.certificateModel.create({
      data: {
        companyId,
        issuer: dto.issuer.trim(),
        thumbprint: dto.thumbprint?.trim() || null,
        serialNumber: dto.serialNumber?.trim() || null,
        validFrom,
        validTo,
        status: dto.status || CertificateStatus.ACTIVE,
      },
    });

    const enriched = this.enrichCertificate(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      action: 'DIGITAL_CERTIFICATE_CREATED',
      entityId: created.id,
      payload: {
        certificateId: created.id,
        issuer: created.issuer,
        thumbprint: created.thumbprint,
        serialNumber: created.serialNumber,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        status: created.status,
        operationalStatus: enriched.operationalStatus,
        daysToExpire: enriched.daysToExpire,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Certificado digital cadastrado com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async update(
    companyId: string,
    certificateId: string,
    dto: UpdateDigitalCertificateDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.findCertificate(companyId, certificateId);

    const data: Record<string, unknown> = {};

    if (dto.issuer !== undefined) data.issuer = dto.issuer.trim();
    if (dto.thumbprint !== undefined) {
      data.thumbprint = dto.thumbprint?.trim() || null;
    }
    if (dto.serialNumber !== undefined) {
      data.serialNumber = dto.serialNumber?.trim() || null;
    }
    if (dto.status !== undefined) data.status = dto.status;

    const nextValidFrom = dto.validFrom
      ? this.parseDate(dto.validFrom, 'validFrom')
      : new Date(current.validFrom);

    const nextValidTo = dto.validTo
      ? this.parseDate(dto.validTo, 'validTo')
      : new Date(current.validTo);

    this.validatePeriod(nextValidFrom, nextValidTo);

    if (dto.validFrom !== undefined) data.validFrom = nextValidFrom;
    if (dto.validTo !== undefined) data.validTo = nextValidTo;

    const updated = await this.certificateModel.update({
      where: {
        id: certificateId,
      },
      data,
    });

    const enriched = this.enrichCertificate(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      action: 'DIGITAL_CERTIFICATE_UPDATED',
      entityId: certificateId,
      payload: {
        certificateId,
        before: this.normalize(this.enrichCertificate(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Certificado digital atualizado com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async revoke(companyId: string, certificateId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.findCertificate(companyId, certificateId);

    const updated = await this.certificateModel.update({
      where: {
        id: certificateId,
      },
      data: {
        status: CertificateStatus.REVOKED,
      },
    });

    const enriched = this.enrichCertificate(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      action: 'DIGITAL_CERTIFICATE_REVOKED',
      entityId: certificateId,
      payload: {
        certificateId,
        before: this.normalize(this.enrichCertificate(current)),
        after: this.normalize(enriched),
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Certificado digital revogado com sucesso.',
      companyId,
      item: this.normalize(enriched),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async remove(companyId: string, certificateId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.findCertificate(companyId, certificateId);

    await this.certificateModel.delete({
      where: {
        id: certificateId,
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      action: 'DIGITAL_CERTIFICATE_DELETED',
      entityId: certificateId,
      payload: {
        certificateId,
        deleted: this.normalize(this.enrichCertificate(current)),
        warning:
          'Exclusão física realizada porque DigitalCertificate não possui deletedAt no schema atual.',
      },
      statusCode: 200,
    });

    return {
      status: 'OK',
      message: 'Certificado digital removido com sucesso.',
      companyId,
      deletedId: certificateId,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }
}
