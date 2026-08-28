'use strict';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CompanyRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { BillingEntitlementsService } from './billing-entitlements.service.js';
import { UpdateCompanyPlanDto } from './dto/update-company-plan.dto.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('billing')
export class BillingEntitlementsController {
  constructor(
    private readonly billingEntitlementsService: BillingEntitlementsService,
  ) {}

  @Get('plans')
  getPlans() {
    return this.billingEntitlementsService.getPlans();
  }

  @Get('entitlements/:companyId')
  getEntitlements(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingEntitlementsService.getEntitlements(companyId, req.user);
  }

  @Get('features/:companyId/check')
  checkFeature(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('feature') feature: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingEntitlementsService.checkFeature(
      companyId,
      feature,
      req.user,
    );
  }

  @Patch('plan/:companyId')
  @Roles(CompanyRole.OWNER)
  updatePlan(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: UpdateCompanyPlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingEntitlementsService.updatePlan(
      companyId,
      body.planLevel,
      req.user,
      body.reason,
    );
  }
}
