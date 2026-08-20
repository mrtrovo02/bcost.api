'use strict';

import { BadRequestException, Injectable } from '@nestjs/common';

export const TAX_REFORM_2026 = {
  sourceVersion: 'NT_2025_002',
  dfeBasicTypesSchema: 'DFeTiposBasicos_v1.00.xsd',
  group: 'UB',
  effectiveFrom: '2026-01-01',
  cbsRate: 0.009,
  ibsRate: 0.001,
  selectiveTaxRate: 0,
} as const;

export type TaxRegimeEngine = 'LEGACY' | 'REFORM_2026';
export type TaxReformTaxType = 'CBS' | 'IBS' | 'IS';
export type NFeIssuePurpose =
  | 'NORMAL'
  | 'COMPLEMENTARY'
  | 'ADJUSTMENT'
  | 'RETURN'
  | 'DEBIT_NOTE'
  | 'CREDIT_NOTE';

export interface CbsIbsSimulationResult {
  revenue: number;
  cbsValue: number;
  ibsValue: number;
  totalTransitionalTax: number;
  collectionDispensedIn2026: boolean;
  netRevenue: number;
  splitPaymentEstimate: {
    retentionAtSource: number;
    effectiveNetCashflow: number;
  };
}

export interface DestinationTaxContext {
  stateIbgeCode: string;
  municipalityIbgeCode?: string;
}

export interface TaxCreditInput {
  taxType: TaxReformTaxType;
  amount: number;
  documentKey?: string;
}

export interface TaxReformItemInput {
  itemId: string;
  description?: string;
  baseAmount: number;
  cstCode?: string;
  cClassTribCode?: string;
  ncm?: string;
  isNationalBasicBasket?: boolean;
  reductionRate?: number;
  legacyTaxAmount?: number;
  selectiveTaxCstCode?: string;
  selectiveTaxClassCode?: string;
  selectiveTaxBaseAmount?: number;
  selectiveTaxUnit?: string;
  selectiveTaxQuantity?: number;
  selectiveTaxAdRemRate?: number;
}

export interface TaxCalculationInput {
  regime: TaxRegimeEngine;
  issuePurpose?: NFeIssuePurpose;
  destination?: DestinationTaxContext;
  items: TaxReformItemInput[];
  credits?: TaxCreditInput[];
  rates?: Partial<Record<TaxReformTaxType, number>>;
}

export interface TaxItemCalculationResult {
  itemId: string;
  baseAmount: number;
  taxableBaseAmount: number;
  cstCode?: string;
  cClassTribCode?: string;
  selectiveTaxCstCode?: string;
  selectiveTaxClassCode?: string;
  selectiveTaxUnit?: string;
  cbsValue: number;
  ibsValue: number;
  ibsStateValue: number;
  ibsMunicipalValue: number;
  selectiveTaxValue: number;
  total: number;
  applied: {
    cbsRate: number;
    ibsRate: number;
    ibsStateRate: number;
    ibsMunicipalRate: number;
    selectiveTaxRate: number;
    selectiveTaxAdRemRate: number;
    selectiveTaxQuantity: number;
    reductionRate: number;
    zeroRate: boolean;
  };
}

export interface TaxCalculationResult {
  regime: TaxRegimeEngine;
  sourceVersion: string;
  xmlSchema: string;
  xmlGroup: 'UB' | 'LEGACY';
  issuePurpose: NFeIssuePurpose;
  destination?: DestinationTaxContext;
  totals: {
    baseAmount: number;
    taxableBaseAmount: number;
    cbsValue: number;
    ibsValue: number;
    selectiveTaxValue: number;
    grossTax: number;
    creditsApplied: number;
    netTax: number;
  };
  items: TaxItemCalculationResult[];
  credits: TaxCreditInput[];
  validations: string[];
}

export interface ITaxCalculator {
  readonly regime: TaxRegimeEngine;
  calculate(input: TaxCalculationInput): TaxCalculationResult;
}

function money(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function rate(value: number | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException('Alíquota deve estar entre 0 e 1.');
  }
  return value;
}

function assertNonNegativeMoney(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException(
      `${field} deve ser um valor numérico não negativo.`,
    );
  }
}

function isDebitOrCreditNote(issuePurpose: NFeIssuePurpose): boolean {
  return issuePurpose === 'DEBIT_NOTE' || issuePurpose === 'CREDIT_NOTE';
}

class LegacyTaxCalculator implements ITaxCalculator {
  readonly regime: TaxRegimeEngine = 'LEGACY';

  calculate(input: TaxCalculationInput): TaxCalculationResult {
    const issuePurpose = input.issuePurpose ?? 'NORMAL';
    const baseAmount = money(
      input.items.reduce((sum, item) => sum + item.baseAmount, 0),
    );
    const legacyTaxAmount = money(
      input.items.reduce((sum, item) => sum + (item.legacyTaxAmount ?? 0), 0),
    );

    return {
      regime: this.regime,
      sourceVersion: 'LEGACY',
      xmlSchema: 'nfe_v4.00',
      xmlGroup: 'LEGACY',
      issuePurpose,
      destination: input.destination,
      totals: {
        baseAmount,
        taxableBaseAmount: baseAmount,
        cbsValue: 0,
        ibsValue: 0,
        selectiveTaxValue: 0,
        grossTax: legacyTaxAmount,
        creditsApplied: 0,
        netTax: legacyTaxAmount,
      },
      items: input.items.map((item) => ({
        itemId: item.itemId,
        baseAmount: money(item.baseAmount),
        taxableBaseAmount: money(item.baseAmount),
        cstCode: item.cstCode,
        cClassTribCode: item.cClassTribCode,
        selectiveTaxCstCode: item.selectiveTaxCstCode,
        selectiveTaxClassCode: item.selectiveTaxClassCode,
        selectiveTaxUnit: item.selectiveTaxUnit,
        cbsValue: 0,
        ibsValue: 0,
        ibsStateValue: 0,
        ibsMunicipalValue: 0,
        selectiveTaxValue: 0,
        total: money(item.legacyTaxAmount ?? 0),
        applied: {
          cbsRate: 0,
          ibsRate: 0,
          ibsStateRate: 0,
          ibsMunicipalRate: 0,
          selectiveTaxRate: 0,
          selectiveTaxAdRemRate: 0,
          selectiveTaxQuantity: 0,
          reductionRate: 0,
          zeroRate: false,
        },
      })),
      credits: [],
      validations: [],
    };
  }
}

class TaxReform2026Calculator implements ITaxCalculator {
  readonly regime: TaxRegimeEngine = 'REFORM_2026';

  calculate(input: TaxCalculationInput): TaxCalculationResult {
    const issuePurpose = input.issuePurpose ?? 'NORMAL';
    const validations: string[] = [];

    if (!input.destination?.stateIbgeCode) {
      validations.push(
        'Destino fiscal ausente: informe o código IBGE da UF de destino.',
      );
    }

    if (isDebitOrCreditNote(issuePurpose)) {
      const hasLegacyTaxes = input.items.some(
        (item) => (item.legacyTaxAmount ?? 0) > 0,
      );
      if (hasLegacyTaxes) {
        throw new BadRequestException(
          'Notas de débito/crédito da NT 2025.002 não devem conter impostos legados nos itens.',
        );
      }
    }

    const cbsRate = rate(input.rates?.CBS, TAX_REFORM_2026.cbsRate);
    const ibsRate = rate(input.rates?.IBS, TAX_REFORM_2026.ibsRate);
    const selectiveTaxRate = rate(
      input.rates?.IS,
      TAX_REFORM_2026.selectiveTaxRate,
    );

    const items = input.items.map((item) => {
      assertNonNegativeMoney(item.baseAmount, 'baseAmount');

      const reductionRate = rate(item.reductionRate, 0);
      const zeroRate = Boolean(item.isNationalBasicBasket);
      const effectiveBase = zeroRate
        ? 0
        : item.baseAmount * (1 - reductionRate);
      const selectiveTaxBaseAmount =
        item.selectiveTaxBaseAmount ?? effectiveBase;
      const selectiveTaxQuantity = item.selectiveTaxQuantity ?? 0;
      const selectiveTaxAdRemRate = item.selectiveTaxAdRemRate ?? 0;

      assertNonNegativeMoney(selectiveTaxBaseAmount, 'selectiveTaxBaseAmount');
      assertNonNegativeMoney(selectiveTaxQuantity, 'selectiveTaxQuantity');
      assertNonNegativeMoney(selectiveTaxAdRemRate, 'selectiveTaxAdRemRate');

      const cbsValue = money(effectiveBase * cbsRate);
      const ibsValue = money(effectiveBase * ibsRate);
      const ibsStateValue = ibsValue;
      const ibsMunicipalValue = 0;
      const selectiveTaxValue = money(
        selectiveTaxBaseAmount * selectiveTaxRate +
          selectiveTaxQuantity * selectiveTaxAdRemRate,
      );

      return {
        itemId: item.itemId,
        baseAmount: money(item.baseAmount),
        taxableBaseAmount: money(effectiveBase),
        cstCode: item.cstCode,
        cClassTribCode: item.cClassTribCode,
        selectiveTaxCstCode: item.selectiveTaxCstCode,
        selectiveTaxClassCode: item.selectiveTaxClassCode,
        selectiveTaxUnit: item.selectiveTaxUnit,
        cbsValue,
        ibsValue,
        ibsStateValue,
        ibsMunicipalValue,
        selectiveTaxValue,
        total: money(cbsValue + ibsValue + selectiveTaxValue),
        applied: {
          cbsRate,
          ibsRate,
          ibsStateRate: ibsRate,
          ibsMunicipalRate: 0,
          selectiveTaxRate,
          selectiveTaxAdRemRate,
          selectiveTaxQuantity,
          reductionRate,
          zeroRate,
        },
      };
    });

    const baseAmount = money(
      items.reduce((sum, item) => sum + item.baseAmount, 0),
    );
    const taxableBaseAmount = money(
      items.reduce((sum, item) => sum + item.taxableBaseAmount, 0),
    );
    const cbsValue = money(items.reduce((sum, item) => sum + item.cbsValue, 0));
    const ibsValue = money(items.reduce((sum, item) => sum + item.ibsValue, 0));
    const selectiveTaxValue = money(
      items.reduce((sum, item) => sum + item.selectiveTaxValue, 0),
    );
    const grossTax = money(cbsValue + ibsValue + selectiveTaxValue);
    const creditsApplied = money(
      (input.credits ?? []).reduce((sum, credit) => {
        assertNonNegativeMoney(credit.amount, 'credit.amount');
        return sum + credit.amount;
      }, 0),
    );
    const netTax = money(Math.max(0, grossTax - creditsApplied));

    return {
      regime: this.regime,
      sourceVersion: TAX_REFORM_2026.sourceVersion,
      xmlSchema: TAX_REFORM_2026.dfeBasicTypesSchema,
      xmlGroup: TAX_REFORM_2026.group,
      issuePurpose,
      destination: input.destination,
      totals: {
        baseAmount,
        taxableBaseAmount,
        cbsValue,
        ibsValue,
        selectiveTaxValue,
        grossTax,
        creditsApplied,
        netTax,
      },
      items,
      credits: input.credits ?? [],
      validations,
    };
  }
}

@Injectable()
export class CbsIbsEngineService {
  private readonly calculators: Record<TaxRegimeEngine, ITaxCalculator> = {
    LEGACY: new LegacyTaxCalculator(),
    REFORM_2026: new TaxReform2026Calculator(),
  };

  public calculate(input: TaxCalculationInput): TaxCalculationResult {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um item fiscal para cálculo.',
      );
    }

    return this.calculators[input.regime].calculate(input);
  }

  public calculateReform2026(
    input: Omit<TaxCalculationInput, 'regime'>,
  ): TaxCalculationResult {
    return this.calculate({ ...input, regime: 'REFORM_2026' });
  }

  public calculateTransitionalTax(
    monthlyRevenue: number,
  ): CbsIbsSimulationResult {
    assertNonNegativeMoney(monthlyRevenue, 'monthlyRevenue');

    const calculation = this.calculateReform2026({
      issuePurpose: 'NORMAL',
      items: [
        {
          itemId: 'monthly-revenue',
          baseAmount: monthlyRevenue,
        },
      ],
    });

    const cbsValue = calculation.totals.cbsValue;
    const ibsValue = calculation.totals.ibsValue;
    const totalTransitionalTax = calculation.totals.grossTax;
    const netRevenue = money(monthlyRevenue);

    return {
      revenue: monthlyRevenue,
      cbsValue,
      ibsValue,
      totalTransitionalTax,
      collectionDispensedIn2026: true,
      netRevenue,
      splitPaymentEstimate: {
        retentionAtSource: 0,
        effectiveNetCashflow: netRevenue,
      },
    };
  }
}
