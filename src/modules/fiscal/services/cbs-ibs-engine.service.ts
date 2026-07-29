'use strict';

import { Injectable } from '@nestjs/common';

export interface CbsIbsSimulationResult {
  revenue: number;
  cbsValue: number;
  ibsValue: number;
  totalTransitionalTax: number;
  netRevenue: number;
  splitPaymentEstimate: {
    retentionAtSource: number;
    effectiveNetCashflow: number;
  };
}

@Injectable()
export class CbsIbsEngineService {
  private readonly CBS_RATE = 0.009; // 0.9%
  private readonly IBS_RATE = 0.001; // 0.1%

  public calculateTransitionalTax(monthlyRevenue: number): CbsIbsSimulationResult {
    const cbsValue = Number((monthlyRevenue * this.CBS_RATE).toFixed(2));
    const ibsValue = Number((monthlyRevenue * this.IBS_RATE).toFixed(2));
    const totalTransitionalTax = Number((cbsValue + ibsValue).toFixed(2));
    const netRevenue = Number((monthlyRevenue - totalTransitionalTax).toFixed(2));

    return {
      revenue: monthlyRevenue,
      cbsValue,
      ibsValue,
      totalTransitionalTax,
      netRevenue,
      splitPaymentEstimate: {
        retentionAtSource: totalTransitionalTax,
        effectiveNetCashflow: netRevenue,
      },
    };
  }
}
