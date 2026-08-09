'use strict';

import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import type {
  NFeIssuePurpose,
  TaxCalculationInput,
  TaxCalculationResult,
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
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return errors;
  }

  buildGrupoUB(input: TaxReformXmlBuildInput): TaxReformXmlBuildResult {
    this.validatePreSend(input);

    const calculation = this.cbsIbsEngine.calculateReform2026(input);

    const payload = {
      UB: {
        '@_schema': TAX_REFORM_2026.dfeBasicTypesSchema,
        infNFeId: input.infNFeId,
        detTrib: calculation.items.map((item) => ({
          itemId: item.itemId,
          CST: item.cstCode,
          cClassTrib: item.cClassTribCode,
          gCBS: {
            pCBS: item.applied.cbsRate.toFixed(6),
            vCBS: item.cbsValue.toFixed(2),
          },
          gIBS: {
            pIBS: item.applied.ibsRate.toFixed(6),
            vIBS: item.ibsValue.toFixed(2),
          },
          ...(item.selectiveTaxValue > 0
            ? {
                gIS: {
                  pIS: item.applied.selectiveTaxRate.toFixed(6),
                  vIS: item.selectiveTaxValue.toFixed(2),
                },
              }
            : {}),
        })),
        total: {
          vBC: calculation.totals.baseAmount.toFixed(2),
          vCBS: calculation.totals.cbsValue.toFixed(2),
          vIBS: calculation.totals.ibsValue.toFixed(2),
          vIS: calculation.totals.selectiveTaxValue.toFixed(2),
          vCred: calculation.totals.creditsApplied.toFixed(2),
          vNFTribReforma: calculation.totals.netTax.toFixed(2),
        },
      },
    };

    return {
      schema: TAX_REFORM_2026.dfeBasicTypesSchema,
      group: TAX_REFORM_2026.group,
      xml: this.builder.build(payload),
      calculation,
      validations: calculation.validations,
    };
  }
}
