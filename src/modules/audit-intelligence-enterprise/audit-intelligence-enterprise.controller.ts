'use strict';

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { AuditIntelligenceQueryDto } from './dto/audit-intelligence-query.dto.js';
import { AuditIntelligenceEnterpriseService } from './audit-intelligence-enterprise.service.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('audit/intelligence')
export class AuditIntelligenceEnterpriseController {
  constructor(private readonly service: AuditIntelligenceEnterpriseService) {}

  @Get(':companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AuditIntelligenceQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.summary(companyId, query, req.user);
  }

  @Get(':companyId/executive')
  executive(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AuditIntelligenceQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.executive(companyId, query, req.user);
  }

  @Get(':companyId/findings')
  findings(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AuditIntelligenceQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.findings(companyId, query, req.user);
  }

  @Get(':companyId/breakdowns')
  breakdowns(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AuditIntelligenceQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.breakdowns(companyId, query, req.user);
  }

  @Get(':companyId/samples')
  samples(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AuditIntelligenceQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.samples(companyId, query, req.user);
  }
}
