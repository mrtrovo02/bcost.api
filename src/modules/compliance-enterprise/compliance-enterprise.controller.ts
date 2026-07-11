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
import { ComplianceEnterpriseService } from './compliance-enterprise.service.js';
import { ComplianceEnterpriseQueryDto } from './dto/compliance-enterprise-query.dto.js';
import { CreateBusinessRuleEnterpriseDto } from './dto/create-business-rule-enterprise.dto.js';
import { CreateComplianceCheckEnterpriseDto } from './dto/create-compliance-check-enterprise.dto.js';
import { RunComplianceEngineDto } from './dto/run-compliance-engine.dto.js';
import { UpdateBusinessRuleEnterpriseDto } from './dto/update-business-rule-enterprise.dto.js';
import { UpdateComplianceCheckEnterpriseDto } from './dto/update-compliance-check-enterprise.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('compliance/enterprise')
export class ComplianceEnterpriseController {
  constructor(private readonly service: ComplianceEnterpriseService) {}

  @Get('summary/:companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: any,
  ) {
    return this.service.summary(companyId, req.user);
  }

  @Get('rules/:companyId')
  listRules(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: ComplianceEnterpriseQueryDto,
    @Req() req: any,
  ) {
    return this.service.listRules(companyId, query, req.user);
  }

  @Post('rules/:companyId')
  createRule(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateBusinessRuleEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.createRule(companyId, body, req.user);
  }

  @Patch('rules/:companyId/:ruleId')
  updateRule(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @Body() body: UpdateBusinessRuleEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.updateRule(companyId, ruleId, body, req.user);
  }

  @Post('rules/:companyId/:ruleId/enable')
  enableRule(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @Req() req: any,
  ) {
    return this.service.setRuleEnabled(companyId, ruleId, true, req.user);
  }

  @Post('rules/:companyId/:ruleId/disable')
  disableRule(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @Req() req: any,
  ) {
    return this.service.setRuleEnabled(companyId, ruleId, false, req.user);
  }

  @Post('rules/:companyId/defaults')
  createDefaultRules(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: any,
  ) {
    return this.service.createDefaultRules(companyId, req.user);
  }

  @Get('checks/:companyId')
  listChecks(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: ComplianceEnterpriseQueryDto,
    @Req() req: any,
  ) {
    return this.service.listChecks(companyId, query, req.user);
  }

  @Post('checks/:companyId')
  createCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateComplianceCheckEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.createCheck(companyId, body, req.user);
  }

  @Patch('checks/:companyId/:checkId')
  updateCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('checkId', new ParseUUIDPipe()) checkId: string,
    @Body() body: UpdateComplianceCheckEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.updateCheck(companyId, checkId, body, req.user);
  }

  @Post('checks/:companyId/:checkId/in-progress')
  markInProgress(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('checkId', new ParseUUIDPipe()) checkId: string,
    @Req() req: any,
  ) {
    return this.service.setCheckStatus(
      companyId,
      checkId,
      'IN_PROGRESS',
      req.user,
    );
  }

  @Post('checks/:companyId/:checkId/resolve')
  resolveCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('checkId', new ParseUUIDPipe()) checkId: string,
    @Req() req: any,
  ) {
    return this.service.setCheckStatus(companyId, checkId, 'RESOLVED', req.user);
  }

  @Post('checks/:companyId/:checkId/ignore')
  ignoreCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('checkId', new ParseUUIDPipe()) checkId: string,
    @Req() req: any,
  ) {
    return this.service.setCheckStatus(companyId, checkId, 'IGNORED', req.user);
  }

  @Post('checks/:companyId/:checkId/reopen')
  reopenCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('checkId', new ParseUUIDPipe()) checkId: string,
    @Req() req: any,
  ) {
    return this.service.setCheckStatus(companyId, checkId, 'OPEN', req.user);
  }

  @Post('run/:companyId')
  runEngine(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: RunComplianceEngineDto,
    @Req() req: any,
  ) {
    return this.service.runEngine(companyId, body, req.user);
  }
}
