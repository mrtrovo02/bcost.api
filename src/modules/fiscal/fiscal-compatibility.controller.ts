'use strict';

import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';

interface FiscalCompatibilityTaxDataResponse {
  success: boolean;
  companyId?: string;
  totalRevenue: number;
  estimatedTax: number;
  netRevenue: number;
  fatorR: string;
  totalInvoices: number;
  taxEfficiency: string;
  suggestion: string;
  cbsRate: number;
  ibsRate: number;
  transitionalTaxActive: boolean;
  effectiveDate: string;
  collectionDispensedIn2026: boolean;
  taxSimulation: ReturnType<CbsIbsEngineService['calculateTransitionalTax']>;
}

@Controller('modules/fiscal')
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
export class FiscalCompatibilityController {
  constructor(private readonly cbsIbsEngine: CbsIbsEngineService) {}

  @Get('tax-data')
  async getTaxData(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
    @Query('revenue') revenueQuery?: string,
  ): Promise<FiscalCompatibilityTaxDataResponse> {
    const activeCompanyId = companyIdFromQuery || companyId;
    const monthlyRevenue = revenueQuery ? Number(revenueQuery) : 100000.0;

    if (!Number.isFinite(monthlyRevenue) || monthlyRevenue < 0) {
      throw new BadRequestException(
        'Receita informada inválida para simulação fiscal.',
      );
    }

    const simulation =
      this.cbsIbsEngine.calculateTransitionalTax(monthlyRevenue);
    const cbsRate = 0.009;
    const ibsRate = 0.001;

    return {
      success: true,
      companyId: activeCompanyId,
      totalRevenue: simulation.revenue,
      estimatedTax: simulation.totalTransitionalTax,
      netRevenue: simulation.netRevenue,
      fatorR: 'N/A',
      totalInvoices: 0,
      taxEfficiency: 'Destaque CBS/IBS 2026: 1.00%',
      suggestion:
        'Destaque técnico de CBS/IBS para 2026; não utilizar como apuração oficial sem documentos fiscais, CNAE, município, regime e revisão CRC.',
      cbsRate,
      ibsRate,
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
