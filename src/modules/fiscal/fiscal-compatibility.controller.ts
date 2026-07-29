'use strict';

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service';

@Controller('modules/fiscal')
export class FiscalCompatibilityController {
  constructor(private readonly cbsIbsEngine: CbsIbsEngineService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('tax-data')
  async getTaxData(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
    @Query('revenue') revenueQuery?: string,
  ) {
    const activeCompanyId = companyIdFromQuery || companyId;
    const monthlyRevenue = revenueQuery ? parseFloat(revenueQuery) : 100000.0;

    const simulation = this.cbsIbsEngine.calculateTransitionalTax(monthlyRevenue);

    return {
      success: true,
      companyId: activeCompanyId,
      cbsRate: 0.009, // 0,9% CBS (Transição 2026)
      ibsRate: 0.001, // 0,1% IBS (Transição 2026)
      transitionalTaxActive: true,
      effectiveDate: '2026-08-01',
      taxSimulation: simulation,
    };
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('tax-data-compat')
  async getTaxDataCompat(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.getTaxData(companyIdFromQuery, companyId);
  }
}
