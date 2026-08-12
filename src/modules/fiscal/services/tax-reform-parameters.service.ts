'use strict';

import { Injectable } from '@nestjs/common';
import {
  TaxJurisdictionScope,
  TaxReformTaxType as PrismaTaxReformTaxType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CbsIbsEngineService,
  TAX_REFORM_2026,
  TaxCalculationResult,
  TaxReformItemInput,
  TaxCreditInput,
  NFeIssuePurpose,
} from './cbs-ibs-engine.service.js';

export interface ResolveTaxReformParametersInput {
  companyId?: string;
  operationDate?: Date;
  destinationStateIbge?: string;
  destinationMunicipalityIbge?: string;
  cstCode?: string;
  cClassTribCode?: string;
}

export interface TaxReformResolvedParameters {
  sourceVersion: string;
  operationDate: string;
  classification?: {
    cstCode: string;
    cClassTribCode: string;
    description: string;
    taxType: PrismaTaxReformTaxType;
    isZeroRate: boolean;
    reductionRate: number;
    creditAllowed: boolean;
    legalBasis?: string | null;
  };
  destinationRule?: {
    destinationStateIbge: string;
    destinationMunicipalityIbge?: string | null;
    appliesIbs: boolean;
    appliesCbs: boolean;
    appliesSelectiveTax: boolean;
    priority: number;
  };
  rates: {
    CBS: number;
    IBS: number;
    IS: number;
  };
  fallbackApplied: boolean;
}

export interface CalculateWithResolvedParametersInput extends ResolveTaxReformParametersInput {
  issuePurpose?: NFeIssuePurpose;
  items: TaxReformItemInput[];
  credits?: TaxCreditInput[];
}

type RateRow = {
  companyId: string | null;
  taxType: PrismaTaxReformTaxType;
  scope: TaxJurisdictionScope;
  jurisdictionCode: string | null;
  rate: unknown;
  validFrom: Date;
  validTo: Date | null;
};

function toNumber(value: unknown): number {
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return Number((value as { toNumber: () => number }).toNumber());
  }

  return Number(value ?? 0);
}

function isWithinPeriod(
  date: Date,
  validFrom: Date,
  validTo?: Date | null,
): boolean {
  return validFrom <= date && (!validTo || validTo >= date);
}

@Injectable()
export class TaxReformParametersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cbsIbsEngine: CbsIbsEngineService,
  ) {}

  async resolveParameters(
    input: ResolveTaxReformParametersInput,
  ): Promise<TaxReformResolvedParameters> {
    const operationDate = input.operationDate ?? new Date();
    const [classification, destinationRule, rateRows] = await Promise.all([
      this.findClassification(input, operationDate),
      this.findDestinationRule(input, operationDate),
      this.findRates(input, operationDate),
    ]);

    const rates = {
      CBS: this.resolveRate(
        rateRows,
        PrismaTaxReformTaxType.CBS,
        [TaxJurisdictionScope.FEDERAL],
        TAX_REFORM_2026.cbsRate,
      ),
      IBS: this.resolveRate(
        rateRows,
        PrismaTaxReformTaxType.IBS,
        [
          TaxJurisdictionScope.MUNICIPAL,
          TaxJurisdictionScope.STATE,
          TaxJurisdictionScope.FEDERAL,
        ],
        TAX_REFORM_2026.ibsRate,
      ),
      IS: this.resolveRate(
        rateRows,
        PrismaTaxReformTaxType.IS,
        [TaxJurisdictionScope.FEDERAL],
        TAX_REFORM_2026.selectiveTaxRate,
      ),
    };

    if (destinationRule && !destinationRule.appliesCbs) rates.CBS = 0;
    if (destinationRule && !destinationRule.appliesIbs) rates.IBS = 0;
    if (destinationRule && !destinationRule.appliesSelectiveTax) rates.IS = 0;

    const classificationReduction = classification
      ? toNumber(classification.reductionRate)
      : 0;

    return {
      sourceVersion:
        classification?.sourceVersion ??
        destinationRule?.sourceVersion ??
        TAX_REFORM_2026.sourceVersion,
      operationDate: operationDate.toISOString(),
      classification: classification
        ? {
            cstCode: classification.cstCode,
            cClassTribCode: classification.cClassTribCode,
            description: classification.description,
            taxType: classification.taxType,
            isZeroRate: classification.isZeroRate,
            reductionRate: classificationReduction,
            creditAllowed: classification.creditAllowed,
            legalBasis: classification.legalBasis,
          }
        : undefined,
      destinationRule: destinationRule
        ? {
            destinationStateIbge: destinationRule.destinationStateIbge,
            destinationMunicipalityIbge:
              destinationRule.destinationMunicipalityIbge,
            appliesIbs: destinationRule.appliesIbs,
            appliesCbs: destinationRule.appliesCbs,
            appliesSelectiveTax: destinationRule.appliesSelectiveTax,
            priority: destinationRule.priority,
          }
        : undefined,
      rates,
      fallbackApplied: rateRows.length === 0,
    };
  }

  async calculateWithResolvedParameters(
    input: CalculateWithResolvedParametersInput,
  ): Promise<{
    parameters: TaxReformResolvedParameters;
    calculation: TaxCalculationResult;
  }> {
    const cstCode = input.cstCode ?? input.items[0]?.cstCode;
    const cClassTribCode =
      input.cClassTribCode ?? input.items[0]?.cClassTribCode;
    const parameters = await this.resolveParameters({
      companyId: input.companyId,
      operationDate: input.operationDate,
      destinationStateIbge: input.destinationStateIbge,
      destinationMunicipalityIbge: input.destinationMunicipalityIbge,
      cstCode,
      cClassTribCode,
    });

    const classification = parameters.classification;
    const items = input.items.map((item) => ({
      ...item,
      cstCode: item.cstCode ?? classification?.cstCode,
      cClassTribCode: item.cClassTribCode ?? classification?.cClassTribCode,
      isNationalBasicBasket:
        item.isNationalBasicBasket ?? classification?.isZeroRate,
      reductionRate: item.reductionRate ?? classification?.reductionRate,
    }));

    return {
      parameters,
      calculation: this.cbsIbsEngine.calculateReform2026({
        issuePurpose: input.issuePurpose,
        destination: input.destinationStateIbge
          ? {
              stateIbgeCode: input.destinationStateIbge,
              municipalityIbgeCode: input.destinationMunicipalityIbge,
            }
          : undefined,
        items,
        credits: input.credits,
        rates: parameters.rates,
      }),
    };
  }

  private async findClassification(
    input: ResolveTaxReformParametersInput,
    operationDate: Date,
  ) {
    if (!input.cstCode || !input.cClassTribCode) return null;

    const rows = await this.prisma.taxClassification.findMany({
      where: {
        cstCode: input.cstCode,
        cClassTribCode: input.cClassTribCode,
        active: true,
      },
      orderBy: [{ validFrom: 'desc' }],
      take: 10,
    });

    return (
      rows.find((row) =>
        isWithinPeriod(operationDate, row.validFrom, row.validTo),
      ) ?? null
    );
  }

  private async findDestinationRule(
    input: ResolveTaxReformParametersInput,
    operationDate: Date,
  ) {
    if (!input.destinationStateIbge) return null;

    const rows = await this.prisma.taxDestinationRule.findMany({
      where: {
        active: true,
        destinationStateIbge: input.destinationStateIbge,
        ...(input.companyId
          ? { OR: [{ companyId: input.companyId }, { companyId: null }] }
          : { companyId: null }),
      },
      orderBy: [{ priority: 'asc' }, { validFrom: 'desc' }],
      take: 50,
    });

    return (
      rows.find((row) => {
        const municipalityMatches =
          !row.destinationMunicipalityIbge ||
          row.destinationMunicipalityIbge === input.destinationMunicipalityIbge;
        const cstMatches = !row.cstCode || row.cstCode === input.cstCode;
        const classMatches =
          !row.cClassTribCode || row.cClassTribCode === input.cClassTribCode;

        return (
          municipalityMatches &&
          cstMatches &&
          classMatches &&
          isWithinPeriod(operationDate, row.validFrom, row.validTo)
        );
      }) ?? null
    );
  }

  private async findRates(
    input: ResolveTaxReformParametersInput,
    operationDate: Date,
  ): Promise<RateRow[]> {
    const jurisdictionCodes = [
      input.destinationStateIbge,
      input.destinationMunicipalityIbge,
    ].filter((value): value is string => value !== undefined);

    const rows = await this.prisma.taxReformRate.findMany({
      where: {
        active: true,
        AND: [
          {
            OR: [
              { jurisdictionCode: null },
              ...(jurisdictionCodes.length > 0
                ? [{ jurisdictionCode: { in: jurisdictionCodes } }]
                : []),
            ],
          },
          input.companyId
            ? { OR: [{ companyId: input.companyId }, { companyId: null }] }
            : { companyId: null },
        ],
      },
      orderBy: [{ validFrom: 'desc' }],
      take: 100,
    });

    return rows.filter((row) => {
      const cstMatches = !row.cstCode || row.cstCode === input.cstCode;
      const classMatches =
        !row.cClassTribCode || row.cClassTribCode === input.cClassTribCode;

      return (
        cstMatches &&
        classMatches &&
        isWithinPeriod(operationDate, row.validFrom, row.validTo)
      );
    });
  }

  private resolveRate(
    rows: RateRow[],
    taxType: PrismaTaxReformTaxType,
    scopePriority: TaxJurisdictionScope[],
    fallback: number,
  ): number {
    for (const scope of scopePriority) {
      const scopedRows = rows
        .filter((row) => row.taxType === taxType && row.scope === scope)
        .sort((a, b) => {
          const companyScore =
            Number(Boolean(b.companyId)) - Number(Boolean(a.companyId));
          if (companyScore !== 0) return companyScore;
          return b.validFrom.getTime() - a.validFrom.getTime();
        });

      const selected = scopedRows[0];
      if (selected) return toNumber(selected.rate);
    }

    return fallback;
  }
}
