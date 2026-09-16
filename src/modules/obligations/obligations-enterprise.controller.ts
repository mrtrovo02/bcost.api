'use strict';

import {
  Body,
  Controller,
  Delete,
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
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { CreateFiscalObligationDto } from './dto/create-fiscal-obligation.dto.js';
import { CreateTaxObligationDto } from './dto/create-tax-obligation.dto.js';
import { QueryObligationsDto } from './dto/query-obligations.dto.js';
import { RegisterTaxEvidenceDto } from './dto/register-tax-evidence.dto.js';
import { SubmitFiscalObligationDto } from './dto/submit-fiscal-obligation.dto.js';
import { UpdateFiscalObligationDto } from './dto/update-fiscal-obligation.dto.js';
import { UpdateTaxObligationDto } from './dto/update-tax-obligation.dto.js';
import { ObligationsEnterpriseService } from './obligations-enterprise.service.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('obligations/enterprise')
export class ObligationsEnterpriseController {
  constructor(private readonly service: ObligationsEnterpriseService) {}

  @Get('tax/:companyId')
  listTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: QueryObligationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listTax(companyId, query, req.user);
  }

  @Get('tax/:companyId/summary')
  summaryTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.summaryTax(companyId, req.user);
  }

  @Post('tax/:companyId')
  createTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateTaxObligationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createTax(companyId, body, req.user);
  }

  @Get('tax/:companyId/:obligationId')
  detailTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.detailTax(companyId, obligationId, req.user);
  }

  @Patch('tax/:companyId/:obligationId')
  updateTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Body() body: UpdateTaxObligationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateTax(companyId, obligationId, body, req.user);
  }

  @Post('tax/:companyId/:obligationId/pay')
  markTaxAsPaid(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.markTaxAsPaid(companyId, obligationId, req.user);
  }

  @Post('tax/:companyId/:obligationId/evidence')
  registerTaxEvidence(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Body() body: RegisterTaxEvidenceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.registerTaxEvidence(
      companyId,
      obligationId,
      body,
      req.user,
    );
  }

  @Post('tax/:companyId/:obligationId/cancel')
  cancelTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancelTax(companyId, obligationId, req.user);
  }

  @Delete('tax/:companyId/:obligationId')
  deleteTax(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.deleteTax(companyId, obligationId, req.user);
  }

  @Get('fiscal/:companyId')
  listFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: QueryObligationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listFiscal(companyId, query, req.user);
  }

  @Get('fiscal/:companyId/summary')
  summaryFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.summaryFiscal(companyId, req.user);
  }

  @Post('fiscal/:companyId')
  createFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateFiscalObligationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createFiscal(companyId, body, req.user);
  }

  @Get('fiscal/:companyId/:obligationId')
  detailFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.detailFiscal(companyId, obligationId, req.user);
  }

  @Patch('fiscal/:companyId/:obligationId')
  updateFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Body() body: UpdateFiscalObligationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateFiscal(companyId, obligationId, body, req.user);
  }

  @Post('fiscal/:companyId/:obligationId/submit')
  submitFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Body() body: SubmitFiscalObligationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.submitFiscal(companyId, obligationId, body, req.user);
  }

  @Post('fiscal/:companyId/:obligationId/accept')
  acceptFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.acceptFiscal(companyId, obligationId, req.user);
  }

  @Post('fiscal/:companyId/:obligationId/reject')
  rejectFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.rejectFiscal(companyId, obligationId, req.user);
  }

  @Delete('fiscal/:companyId/:obligationId')
  deleteFiscal(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.deleteFiscal(companyId, obligationId, req.user);
  }
}
