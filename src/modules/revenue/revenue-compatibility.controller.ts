'use strict';

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';

export interface RevenueMetrics {
  totalRevenue: number;
  monthlyAverage: number;
  growthRate: number;
}

export interface RevenueStatsResponse {
  success: boolean;
  companyId: string;
  metrics: RevenueMetrics;
  updatedAt: string;
}

export interface BillingEntitlementsFeatures {
  fatorR: boolean;
  cbsIbsSimulation: boolean;
  multiCnpj: boolean;
  exportPdf: boolean;
}

export interface BillingEntitlementsResponse {
  success: boolean;
  companyId: string;
  plan: string;
  features: BillingEntitlementsFeatures;
}

export interface TaxDataResponse {
  success: boolean;
  companyId: string | undefined;
  cbsRate: number;
  ibsRate: number;
  transitionalTaxActive: boolean;
  effectiveDate: string;
}

export class TaxDataQueryDto {
  company_id?: string;
  companyId?: string;
}

@Controller()
@UseGuards(TenantContextGuard, CompanyAccessGuard)
export class RevenueCompatibilityController {
  @Get('revenue/stats/:companyId')
  async getRevenueStats(
    @Param('companyId') companyId: string,
  ): Promise<RevenueStatsResponse> {
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
  async getBillingEntitlements(
    @Param('companyId') companyId: string,
  ): Promise<BillingEntitlementsResponse> {
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

  @Get('revenue/compatibility/tax-data')
  async getTaxData(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
  ): Promise<TaxDataResponse> {
    const activeCompanyId: string | undefined = companyIdFromQuery || companyId;
    return {
      success: true,
      companyId: activeCompanyId,
      cbsRate: 0.009,
      ibsRate: 0.001,
      transitionalTaxActive: true,
      effectiveDate: '2026-08-01',
    };
  }
}
