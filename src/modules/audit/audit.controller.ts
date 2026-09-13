'use strict';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { AuditService } from './audit.service.js';
import { CreateAuditLogDto } from './dto/create-audit-log.dto.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

type AuditHttpRequest = AuthenticatedRequest & {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
};

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

@ApiTags('Audit - Auditoria Enterprise')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get(':companyId')
  @ApiOperation({
    summary: 'AUDIT: Listar logs de auditoria por empresa',
  })
  async list(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AuditQueryDto,
  ) {
    return await this.auditService.list(companyId, query);
  }

  @Get('summary/:companyId')
  @ApiOperation({
    summary: 'AUDIT: Resumo de auditoria por empresa',
  })
  async summary(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.auditService.summary(companyId);
  }

  @Get('health/:companyId')
  @ApiOperation({
    summary: 'AUDIT: Health check do módulo de auditoria',
  })
  async health(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return await this.auditService.health(companyId);
  }

  @Post(':companyId')
  @ApiOperation({
    summary: 'AUDIT: Registrar evento de auditoria manual/sistêmico',
  })
  async create(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() dto: CreateAuditLogDto,
    @Req() req: AuditHttpRequest,
  ) {
    const forwardedFor = firstHeaderValue(req.headers?.['x-forwarded-for']);
    const userAgent = firstHeaderValue(req.headers?.['user-agent']);

    const enriched: CreateAuditLogDto = {
      ...dto,
      ipAddress:
        dto.ipAddress || forwardedFor || req.ip || req.socket?.remoteAddress,
      userAgent: dto.userAgent || userAgent,
    };

    return await this.auditService.create(companyId, enriched);
  }
}
