'use strict';

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';

@Controller()
@UseGuards(TenantContextGuard, CompanyAccessGuard)
export class RevenueCompatibilityController {
  @Get('revenue/stats/:companyId')
  async getRevenueStats(@Param('companyId') companyId: string) {
    return {
      success: true,
      companyId,
      metrics: {
        totalRevenue: 0,
        monthlyAverage: 0,
        growthRate: 0,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  @Get('billing/entitlements/:companyId')
  async getBillingEntitlements(@Param('companyId') companyId: string) {
    return {
      success: true,
      companyId,
      plan: 'ENTERPRISE',
      features: {
        fatorR: true,
        cbsIbsSimulation: true,
        multiCnpj: true,
        exportPdf: true,
      },
    };
  }

  @Get('modules/fiscal/tax-data')
  async getTaxData(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
  ) {
    const activeCompanyId = companyIdFromQuery || companyId;
    return {
      success: true,
      companyId: activeCompanyId,
      cbsRate: 0.009, // 0,9% CBS
      ibsRate: 0.001, // 0,1% IBS
      transitionalTaxActive: true,
      effectiveDate: '2026-08-01',
    };
  }
}
