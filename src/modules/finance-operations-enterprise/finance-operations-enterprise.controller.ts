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
import { FinanceOperationsQueryDto } from './dto/finance-operations-query.dto.js';
import { FinanceOperationsEnterpriseService } from './finance-operations-enterprise.service.js';

@UseGuards(JwtAuthGuard)
@Controller('finance/operations')
export class FinanceOperationsEnterpriseController {
  constructor(private readonly service: FinanceOperationsEnterpriseService) {}

  @Get(':companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: FinanceOperationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.summary(companyId, query, req.user);
  }

  @Get(':companyId/receivables')
  receivables(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: FinanceOperationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.receivables(companyId, query, req.user);
  }

  @Get(':companyId/payables')
  payables(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: FinanceOperationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.payables(companyId, query, req.user);
  }

  @Get(':companyId/cashflow')
  cashflow(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: FinanceOperationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.cashflow(companyId, query, req.user);
  }

  @Get(':companyId/aging')
  aging(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: FinanceOperationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.aging(companyId, query, req.user);
  }

  @Get(':companyId/timeline')
  timeline(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: FinanceOperationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.timeline(companyId, query, req.user);
  }
}
