'use strict';

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';

@Controller('modules/fiscal')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
export class FiscalCompatibilityController {
  constructor(private readonly cbsIbsEngine: CbsIbsEngineService) {}

  @Get('tax-data')
  async getTaxData(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
    @Query('revenue') revenueQuery?: string,
  ) {
    const activeCompanyId = companyIdFromQuery || companyId;
    const monthlyRevenue = revenueQuery ? parseFloat(revenueQuery) : 100000.0;

    const simulation =
      this.cbsIbsEngine.calculateTransitionalTax(monthlyRevenue);

    return {
      success: true,
      companyId: activeCompanyId,
      cbsRate: 0.009, // 0,9% CBS (Transição 2026)
      ibsRate: 0.001, // 0,1% IBS (Transição 2026)
      transitionalTaxActive: true,
      effectiveDate: '2026-01-01',
      collectionDispensedIn2026: true,
      taxSimulation: simulation,
    };
  }

  @Get('tax-data-compat')
  async getTaxDataCompat(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.getTaxData(companyIdFromQuery, companyId);
  }
}
