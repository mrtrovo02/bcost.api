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
import { RequiresFeature } from '../billing/decorators/requires-feature.decorator.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { AutoReconciliationEnterpriseDto } from './dto/auto-reconciliation-enterprise.dto.js';
import { BankingEnterpriseQueryDto } from './dto/banking-enterprise-query.dto.js';
import { CreateBankAccountEnterpriseDto } from './dto/create-bank-account-enterprise.dto.js';
import { CreateBankTransactionEnterpriseDto } from './dto/create-bank-transaction-enterprise.dto.js';
import { ManualReconciliationEnterpriseDto } from './dto/manual-reconciliation-enterprise.dto.js';
import { UpdateBankAccountEnterpriseDto } from './dto/update-bank-account-enterprise.dto.js';
import { UpdateBankTransactionEnterpriseDto } from './dto/update-bank-transaction-enterprise.dto.js';
import { BankingEnterpriseService } from './banking-enterprise.service.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@RequiresFeature('banking.reconciliation')
@Controller('banking/enterprise')
export class BankingEnterpriseController {
  constructor(private readonly service: BankingEnterpriseService) {}

  @Get('summary/:companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.summary(companyId, req.user);
  }

  @Get('accounts/:companyId')
  listAccounts(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: BankingEnterpriseQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listAccounts(companyId, query, req.user);
  }

  @Post('accounts/:companyId')
  createAccount(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateBankAccountEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createAccount(companyId, body, req.user);
  }

  @Patch('accounts/:companyId/:bankAccountId')
  updateAccount(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('bankAccountId', new ParseUUIDPipe()) bankAccountId: string,
    @Body() body: UpdateBankAccountEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateAccount(companyId, bankAccountId, body, req.user);
  }

  @Post('accounts/:companyId/:bankAccountId/deactivate')
  deactivateAccount(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('bankAccountId', new ParseUUIDPipe()) bankAccountId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.deactivateAccount(companyId, bankAccountId, req.user);
  }

  @Get('transactions/:companyId')
  listTransactions(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: BankingEnterpriseQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listTransactions(companyId, query, req.user);
  }

  @Post('transactions/:companyId')
  createTransaction(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateBankTransactionEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createTransaction(companyId, body, req.user);
  }

  @Get('transactions/:companyId/:transactionId')
  detailTransaction(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.detailTransaction(companyId, transactionId, req.user);
  }

  @Patch('transactions/:companyId/:transactionId')
  updateTransaction(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body() body: UpdateBankTransactionEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateTransaction(
      companyId,
      transactionId,
      body,
      req.user,
    );
  }

  @Get('reconciliation/:companyId/candidates/:transactionId')
  candidates(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Query() query: AutoReconciliationEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.candidatesForTransaction(
      companyId,
      transactionId,
      query,
      req.user,
    );
  }

  @Post('reconciliation/:companyId/manual')
  manualReconcile(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: ManualReconciliationEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.manualReconcile(companyId, body, req.user);
  }

  @Post('reconciliation/:companyId/auto')
  autoReconcile(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: AutoReconciliationEnterpriseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.autoReconcile(companyId, body, req.user);
  }

  @Post('reconciliation/:companyId/undo/:transactionId')
  undoReconciliation(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.undoReconciliation(companyId, transactionId, req.user);
  }
}
