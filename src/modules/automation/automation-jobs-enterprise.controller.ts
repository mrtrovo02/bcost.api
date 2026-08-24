'use strict';

import {
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
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { AutomationJobsEnterpriseService } from './automation-jobs-enterprise.service.js';
import { AutomationJobsQueryDto } from './dto/automation-jobs-query.dto.js';

@ApiTags('Automation Jobs Enterprise')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('automation/jobs')
export class AutomationJobsEnterpriseController {
  constructor(private readonly service: AutomationJobsEnterpriseService) {}

  @Get(':companyId')
  @ApiOperation({
    summary: 'ENTERPRISE: Lista jobs de automação por empresa',
  })
  list(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: AutomationJobsQueryDto,
    @Req() req: any,
  ) {
    return this.service.list(companyId, query, req.user);
  }

  @Get(':companyId/:jobId')
  @ApiOperation({
    summary: 'ENTERPRISE: Detalhe de um job de automação',
  })
  detail(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('jobId') jobId: string,
    @Req() req: any,
  ) {
    return this.service.detail(companyId, jobId, req.user);
  }

  @Post(':jobId/retry')
  @ApiOperation({
    summary: 'ENTERPRISE: Solicita retry de um job de automação',
  })
  retry(@Param('jobId') jobId: string, @Req() req: any) {
    return this.service.retry(jobId, req.user);
  }

  @Post(':jobId/cancel')
  @ApiOperation({
    summary: 'ENTERPRISE: Solicita cancelamento de um job de automação',
  })
  cancel(@Param('jobId') jobId: string, @Req() req: any) {
    return this.service.cancel(jobId, req.user);
  }

  @Post(':jobId/acknowledge')
  @ApiOperation({
    summary: 'ENTERPRISE: Reconhece um job com falha sem alterar seu status',
  })
  acknowledge(@Param('jobId') jobId: string, @Req() req: any) {
    return this.service.acknowledge(jobId, req.user);
  }
}
