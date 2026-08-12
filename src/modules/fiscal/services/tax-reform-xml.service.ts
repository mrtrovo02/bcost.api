'use strict';

import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import type {
  NFeIssuePurpose,
  TaxCalculationInput,
  TaxCalculationResult,
  TaxItemCalculationResult,
} from './cbs-ibs-engine.service.js';
import {
  CbsIbsEngineService,
  TAX_REFORM_2026,
} from './cbs-ibs-engine.service.js';

export interface TaxReformXmlBuildInput extends Omit<
  TaxCalculationInput,
  'regime'
> {
  infNFeId?: string;
}

export interface TaxReformXmlBuildResult {
  schema: typeof TAX_REFORM_2026.dfeBasicTypesSchema;
  group: typeof TAX_REFORM_2026.group;
  xml: string;
  calculation: TaxCalculationResult;
  validations: string[];
}

function isDebitOrCreditNote(issuePurpose?: NFeIssuePurpose): boolean {
  return issuePurpose === 'DEBIT_NOTE' || issuePurpose === 'CREDIT_NOTE';
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatPercent(rate: number): string {
  return (rate * 100).toFixed(4);
}

function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefined(entryValue)]);

    return Object.fromEntries(entries) as T;
  }

  return value;
}

@Injectable()
export class TaxReformXmlService {
  private readonly builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });

  constructor(private readonly cbsIbsEngine: CbsIbsEngineService) {}

  validatePreSend(input: TaxReformXmlBuildInput): string[] {
    const errors: string[] = [];

    if (!input.items || input.items.length === 0) {
      errors.push('Grupo UB exige ao menos um item fiscal.');
    }

    if (isDebitOrCreditNote(input.issuePurpose)) {
      const legacyItems = (input.items ?? []).filter(
        (item) => (item.legacyTaxAmount ?? 0) > 0,
      );

      if (legacyItems.length > 0) {
        errors.push(
          'Notas de Crédito/Débito não podem conter impostos legados nos itens.',
        );
      }
    }

    for (const item of input.items ?? []) {
      if (item.cstCode && !/^\d{3}$/.test(item.cstCode)) {
        errors.push(`Item ${item.itemId}: CST deve ter 3 dígitos.`);
      }

      if (item.cClassTribCode && !/^\d{6}$/.test(item.cClassTribCode)) {
        errors.push(`Item ${item.itemId}: cClassTrib deve ter 6 dígitos.`);
      }

      if (
        item.selectiveTaxCstCode &&
        !/^\d{3}$/.test(item.selectiveTaxCstCode)
      ) {
        errors.push(`Item ${item.itemId}: CSTIS deve ter 3 dígitos.`);
      }

      if (
        item.selectiveTaxClassCode &&
        !/^\d{6}$/.test(item.selectiveTaxClassCode)
      ) {
        errors.push(`Item ${item.itemId}: cClassTribIS deve ter 6 dígitos.`);
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return errors;
  }

  buildGrupoUB(input: TaxReformXmlBuildInput): TaxReformXmlBuildResult {
    this.validatePreSend(input);

    const calculation = this.cbsIbsEngine.calculateReform2026(input);

    const payload = pruneUndefined({
      UB: {
        '@_schema': TAX_REFORM_2026.dfeBasicTypesSchema,
        infNFeId: input.infNFeId,
        det: calculation.items.map((item, index) =>
          this.buildDetItem(item, index + 1, calculation),
        ),
        IBSCBSTot: this.buildTotals(calculation),
      },
    });

    return {
      schema: TAX_REFORM_2026.dfeBasicTypesSchema,
      group: TAX_REFORM_2026.group,
      xml: this.builder.build(payload),
      calculation,
      validations: calculation.validations,
    };
  }

  private buildDetItem(
    item: TaxItemCalculationResult,
    itemNumber: number,
    calculation: TaxCalculationResult,
  ) {
    const cMunFGIBS = calculation.destination?.municipalityIbgeCode;

    return {
      '@_nItem': itemNumber,
      prod: {
        itemId: item.itemId,
        cMunFGIBS,
      },
      imposto: {
        UB: {
          ...(item.selectiveTaxValue > 0
            ? {
                IS: {
                  CSTIS: item.selectiveTaxCstCode,
                  cClassTribIS: item.selectiveTaxClassCode,
                  vBCIS: formatMoney(item.taxableBaseAmount),
                  pIS: formatPercent(item.applied.selectiveTaxRate),
                  adRemIS:
                    item.applied.selectiveTaxAdRemRate > 0
                      ? formatMoney(item.applied.selectiveTaxAdRemRate)
                      : undefined,
                  uTrib:
                    item.applied.selectiveTaxQuantity > 0
                      ? (item.selectiveTaxUnit ?? 'UN')
                      : undefined,
                  qTrib:
                    item.applied.selectiveTaxQuantity > 0
                      ? item.applied.selectiveTaxQuantity.toFixed(4)
                      : undefined,
                  vIS: formatMoney(item.selectiveTaxValue),
                },
              }
            : {}),
          IBSCBS: {
            CST: item.cstCode,
            cClassTrib: item.cClassTribCode,
            gIBSCBS: {
              vBC: formatMoney(item.taxableBaseAmount),
              gIBSUF: {
                pIBSUF: formatPercent(item.applied.ibsStateRate),
                vIBSUF: formatMoney(item.ibsStateValue),
              },
              gIBSMun: {
                pIBSMun: formatPercent(item.applied.ibsMunicipalRate),
                vIBSMun: formatMoney(item.ibsMunicipalValue),
              },
              vIBS: formatMoney(item.ibsValue),
              gCBS: {
                pCBS: formatPercent(item.applied.cbsRate),
                vCBS: formatMoney(item.cbsValue),
              },
            },
          },
        },
      },
    };
  }

  private buildTotals(calculation: TaxCalculationResult) {
    return {
      vBC: formatMoney(calculation.totals.taxableBaseAmount),
      vCBS: formatMoney(calculation.totals.cbsValue),
      vIBS: formatMoney(calculation.totals.ibsValue),
      vIS: formatMoney(calculation.totals.selectiveTaxValue),
      vCred: formatMoney(calculation.totals.creditsApplied),
      vNFTribReforma: formatMoney(calculation.totals.netTax),
    };
  }
}
