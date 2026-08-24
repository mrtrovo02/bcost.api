'use strict';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { AccountingEnterpriseService } from './accounting-enterprise.service.js';
import { CreateAccountPlanDto } from './dto/create-account-plan.dto.js';
import { CreateAccountingEntryDto } from './dto/create-accounting-entry.dto.js';
import { LockPeriodDto } from './dto/lock-period.dto.js';
import { QueryAccountingDto } from './dto/query-accounting.dto.js';
import { UpdateAccountPlanDto } from './dto/update-account-plan.dto.js';
import { UpdateAccountingEntryDto } from './dto/update-accounting-entry.dto.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('accounting/enterprise')
export class AccountingEnterpriseController {
  constructor(private readonly service: AccountingEnterpriseService) {}

  @Get('account-plan/:companyId')
  listAccountPlan(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: QueryAccountingDto,
    @Req() req: any,
  ) {
    return this.service.listAccountPlan(companyId, query, req.user);
  }

  @Post('account-plan/:companyId')
  createAccountPlan(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateAccountPlanDto,
    @Req() req: any,
  ) {
    return this.service.createAccountPlan(companyId, body, req.user);
  }

  @Post('account-plan/:companyId/seed-default')
  seedDefaultAccountPlan(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: any,
  ) {
    return this.service.seedDefaultAccountPlan(companyId, req.user);
  }

  @Patch('account-plan/:companyId/:accountId')
  updateAccountPlan(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() body: UpdateAccountPlanDto,
    @Req() req: any,
  ) {
    return this.service.updateAccountPlan(companyId, accountId, body, req.user);
  }

  @Post('account-plan/:companyId/:accountId/deactivate')
  deactivateAccountPlan(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Req() req: any,
  ) {
    return this.service.deactivateAccountPlan(companyId, accountId, req.user);
  }

  @Get('entries/:companyId')
  listEntries(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: QueryAccountingDto,
    @Req() req: any,
  ) {
    return this.service.listEntries(companyId, query, req.user);
  }

  @Post('entries/:companyId')
  createEntry(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateAccountingEntryDto,
    @Req() req: any,
  ) {
    return this.service.createEntry(companyId, body, req.user);
  }

  @Get('entries/:companyId/:entryId')
  detailEntry(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Req() req: any,
  ) {
    return this.service.detailEntry(companyId, entryId, req.user);
  }

  @Patch('entries/:companyId/:entryId')
  updateEntry(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: UpdateAccountingEntryDto,
    @Req() req: any,
  ) {
    return this.service.updateEntry(companyId, entryId, body, req.user);
  }

  @Delete('entries/:companyId/:entryId')
  deleteEntry(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Req() req: any,
  ) {
    return this.service.deleteEntry(companyId, entryId, req.user);
  }

  @Get('locks/:companyId')
  listLocks(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: any,
  ) {
    return this.service.listLocks(companyId, req.user);
  }

  @Post('locks/:companyId')
  lockPeriod(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: LockPeriodDto,
    @Req() req: any,
  ) {
    return this.service.lockPeriod(companyId, body, req.user);
  }

  @Delete('locks/:companyId/:month/:year')
  unlockPeriod(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('month', ParseIntPipe) month: number,
    @Param('year', ParseIntPipe) year: number,
    @Req() req: any,
  ) {
    return this.service.unlockPeriod(companyId, month, year, req.user);
  }
}
