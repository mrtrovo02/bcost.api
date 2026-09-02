'use strict';

import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { FiscalService } from './fiscal.service.js';

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
  constructor(
    private readonly cbsIbsEngine: CbsIbsEngineService,
    private readonly fiscalService: FiscalService,
  ) {}

  @Get('tax-data')
  async getTaxData(
    @Query('company_id') companyIdFromQuery?: string,
    @Query('companyId') companyId?: string,
    @Query('revenue') revenueQuery?: string,
    @Query('month') monthQuery?: string,
    @Query('year') yearQuery?: string,
  ): Promise<FiscalCompatibilityTaxDataResponse> {
    const activeCompanyId = companyIdFromQuery || companyId;

    if (!activeCompanyId) {
      throw new BadRequestException(
        'Empresa ativa obrigatória para consultar dados fiscais.',
      );
    }

    const now = new Date();
    const month = this.parseOptionalPositiveInt(monthQuery) ?? now.getMonth() + 1;
    const year = this.parseOptionalPositiveInt(yearQuery) ?? now.getFullYear();

    if (month < 1 || month > 12) {
      throw new BadRequestException('Mês de competência fiscal inválido.');
    }

    const monthlyTax = await this.fiscalService.calculateMonthlyTax(
      activeCompanyId,
      month,
      year,
    );

    const requestedRevenue = revenueQuery ? Number(revenueQuery) : null;

    if (
      requestedRevenue !== null &&
      (!Number.isFinite(requestedRevenue) || requestedRevenue < 0)
    ) {
      throw new BadRequestException(
        'Receita informada inválida para simulação fiscal.',
      );
    }

    const monthlyRevenue = requestedRevenue ?? monthlyTax.metrics.faturamentoMes;
    const simulation =
      this.cbsIbsEngine.calculateTransitionalTax(monthlyRevenue);
    const cbsRate = 0.009;
    const ibsRate = 0.001;

    return {
      success: true,
      companyId: activeCompanyId,
      totalRevenue: monthlyRevenue,
      estimatedTax: monthlyTax.financial.impostoAPagar,
      netRevenue: Number(
        (monthlyRevenue - monthlyTax.financial.impostoAPagar).toFixed(2),
      ),
      fatorR: `${monthlyTax.metrics.fatorR.toFixed(2)}%`,
      totalInvoices: monthlyTax.integrity.count,
      taxEfficiency: `Anexo ${monthlyTax.metrics.anexoUtilizado} • Alíquota efetiva ${monthlyTax.metrics.aliqEfetiva.toFixed(2)}%`,
      suggestion: this.buildFiscalSuggestion(monthlyTax.metrics.fatorR),
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

  private parseOptionalPositiveInt(value?: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Competência fiscal inválida.');
    }
    return parsed;
  }

  private buildFiscalSuggestion(factorR: number): string {
    if (factorR > 0 && factorR < 28) {
      return 'Fator R abaixo de 28%; validar folha, pró-labore, CNAE e anexos antes de orientar enquadramento.';
    }

    return 'Dados fiscais calculados a partir da competência informada; validar documentos, município, CNAE e revisão CRC antes de emissão oficial.';
  }
}
