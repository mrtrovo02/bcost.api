'use strict';

import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';
import {
  TaxScenarioCalculation,
  TaxScenarioModel,
  TaxScenarioRecommendation,
  TaxScenarioSimulationResponse,
} from './tax-scenarios.types.js';

const MEI_ANNUAL_LIMIT = 81_000;
const FACTOR_R_THRESHOLD = 28;
const CBS_INFORMATIVE_2026 = 0.009;
const IBS_INFORMATIVE_2026 = 0.001;

@Injectable()
export class TaxScenariosService {
  simulate(input: SimulateTaxScenarioDto): TaxScenarioSimulationResponse {
    const annualRevenue = this.money(input.monthlyRevenue * 12);
    const annualExpenses = this.money(input.monthlyDeductibleExpenses * 12);
    const annualPayroll = this.money(input.monthlyPayroll * 12);
    const factorRPercentage =
      annualRevenue > 0
        ? this.round((annualPayroll / annualRevenue) * 100, 2)
        : 0;

    const comparisons = [
      this.calculatePf(input, annualRevenue, annualExpenses),
      this.calculateMei(annualRevenue),
      this.calculateSimples(
        input,
        annualRevenue,
        annualPayroll,
        factorRPercentage,
      ),
      this.calculateLucroPresumido(input, annualRevenue),
    ];
    const viableComparisons = comparisons.filter(
      (item) => item.estimatedTax >= 0,
    );
    const best = [...viableComparisons].sort(
      (a, b) => b.netAnnualResult - a.netAnnualResult,
    )[0];
    const requiredPayrollForThreshold = this.money(
      Math.max(0, annualRevenue * (FACTOR_R_THRESHOLD / 100) - annualPayroll),
    );
    const reformBase = Math.max(0, annualRevenue);
    const recommendation = this.buildRecommendation(
      input,
      best?.model ?? 'PF',
      comparisons,
      factorRPercentage,
    );

    return {
      status: 'OK',
      input,
      assumptions: [
        {
          code: 'SIMULATION_NOT_OFFICIAL_TAX_ASSESSMENT',
          description:
            'Resultado estimativo para triagem comercial e planejamento assistido; não substitui escrituração, apuração oficial ou parecer técnico.',
          sourceBasis: [
            'EC 132/2023',
            'LC 214/2025',
            'RIR/2018',
            'Lei Complementar 123/2006',
          ],
        },
        {
          code: 'CBS_IBS_2026_CALIBRATION',
          description:
            'CBS/IBS em 2026 tratados como destaque informativo e calibração operacional, sem premissa de recolhimento definitivo.',
          sourceBasis: [
            'LC 214/2025',
            'Notas Técnicas NF-e/NFC-e RTC 2025/2026',
          ],
        },
      ],
      comparisons,
      bestEstimatedModel: best?.model ?? 'PF',
      factorR: {
        percentage: factorRPercentage,
        qualifiesForAnexoIIIReview: factorRPercentage >= FACTOR_R_THRESHOLD,
        requiredPayrollForThreshold,
      },
      reformImpact: {
        calibrationYear: 2026,
        cbsInformativeRate: CBS_INFORMATIVE_2026,
        ibsInformativeRate: IBS_INFORMATIVE_2026,
        estimatedCbs: this.money(reformBase * CBS_INFORMATIVE_2026),
        estimatedIbs: this.money(reformBase * IBS_INFORMATIVE_2026),
        note: 'Valores de CBS/IBS são informativos para 2026 e devem ser revisados conforme ato técnico, município, atividade e documento fiscal.',
      },
      recommendation,
      guardrails: [
        'Não prometer economia tributária sem validar CNAE, município, regime, pró-labore, folha e documentos fiscais.',
        'Abertura, migração ou alteração de empresa exige validação de contador responsável e evidências oficiais.',
        'Simulação PF x PJ não contempla todos os cenários de retenções, ISS fixo, benefícios fiscais, atividades reguladas ou regimes específicos.',
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  scenarioId(input: SimulateTaxScenarioDto): string {
    return createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')
      .slice(0, 16);
  }

  private calculatePf(
    input: SimulateTaxScenarioDto,
    annualRevenue: number,
    annualExpenses: number,
  ): TaxScenarioCalculation {
    const dependentDeduction = input.dependents * 2_275.08;
    const taxableBase = Math.max(
      0,
      annualRevenue - annualExpenses - dependentDeduction,
    );
    const estimatedTax = this.money(this.progressiveIrpf(taxableBase));

    return this.buildCalculation({
      model: 'PF',
      annualRevenue,
      annualDeductibleExpenses: annualExpenses,
      annualPayroll: 0,
      taxableBase,
      estimatedTax,
      warnings:
        annualRevenue > 120_000
          ? [
              'Receita anual elevada para PF: avaliar retenções, livro caixa e estrutura PJ.',
            ]
          : [],
      components: [
        {
          code: 'IRPF_PROGRESSIVE_ESTIMATE',
          label: 'IRPF progressivo estimado',
          amount: estimatedTax,
          basis: 'Tabela progressiva anual simplificada, sem substituir DIRPF.',
        },
      ],
    });
  }

  private calculateMei(annualRevenue: number): TaxScenarioCalculation {
    const overLimit = annualRevenue > MEI_ANNUAL_LIMIT;
    const estimatedTax = overLimit ? -1 : this.money(85 * 12);

    return this.buildCalculation({
      model: 'MEI',
      annualRevenue,
      annualDeductibleExpenses: 0,
      annualPayroll: 0,
      taxableBase: annualRevenue,
      estimatedTax,
      warnings: overLimit
        ? [
            'Faturamento informado supera o limite anual usual do MEI; exige avaliação de desenquadramento.',
          ]
        : ['MEI depende de atividade permitida e demais limites legais.'],
      components: [
        {
          code: 'MEI_FIXED_MONTHLY_DAS_ESTIMATE',
          label: 'DAS mensal fixo estimado',
          amount: Math.max(0, estimatedTax),
          basis:
            'Estimativa orientativa; valor real depende da atividade e legislação vigente.',
        },
      ],
    });
  }

  private calculateSimples(
    input: SimulateTaxScenarioDto,
    annualRevenue: number,
    annualPayroll: number,
    factorRPercentage: number,
  ): TaxScenarioCalculation {
    const serviceActivity = [
      'LEGAL',
      'TECHNOLOGY',
      'CONSULTING',
      'SERVICE_PROVIDER',
    ].includes(input.activity);
    const nominalRate = serviceActivity
      ? factorRPercentage >= FACTOR_R_THRESHOLD
        ? 0.06
        : 0.155
      : 0.06;
    const estimatedTax = this.money(annualRevenue * nominalRate);

    return this.buildCalculation({
      model: 'SIMPLES_NACIONAL',
      annualRevenue,
      annualDeductibleExpenses: 0,
      annualPayroll,
      taxableBase: annualRevenue,
      estimatedTax,
      warnings: [
        'Alíquota efetiva do Simples depende de RBT12, anexo, parcela a deduzir, CNAE e segregação de receitas.',
        ...(serviceActivity && factorRPercentage < FACTOR_R_THRESHOLD
          ? [
              'Fator R abaixo de 28% pode deslocar serviços para carga maior; revisar pró-labore/folha.',
            ]
          : []),
      ],
      components: [
        {
          code:
            factorRPercentage >= FACTOR_R_THRESHOLD
              ? 'SIMPLES_FACTOR_R_REVIEW'
              : 'SIMPLES_SERVICE_ESTIMATE',
          label:
            factorRPercentage >= FACTOR_R_THRESHOLD
              ? 'Simples estimado com revisão de Fator R'
              : 'Simples estimado para serviço',
          amount: estimatedTax,
          rate: nominalRate,
          basis: 'Triagem comercial baseada em receita anualizada e Fator R.',
        },
      ],
    });
  }

  private calculateLucroPresumido(
    input: SimulateTaxScenarioDto,
    annualRevenue: number,
  ): TaxScenarioCalculation {
    const presumedMargin = input.activity === 'HEALTHCARE' ? 0.32 : 0.32;
    const irCsll = annualRevenue * presumedMargin * 0.24;
    const pisCofins = annualRevenue * 0.0365;
    const iss = annualRevenue * 0.03;
    const estimatedTax = this.money(irCsll + pisCofins + iss);

    return this.buildCalculation({
      model: 'LUCRO_PRESUMIDO',
      annualRevenue,
      annualDeductibleExpenses: 0,
      annualPayroll: 0,
      taxableBase: this.money(annualRevenue * presumedMargin),
      estimatedTax,
      warnings: [
        'ISS varia por município e serviço; retenções e adicional de IRPJ podem alterar o resultado.',
      ],
      components: [
        {
          code: 'IRPJ_CSLL_PRESUMED',
          label: 'IRPJ/CSLL sobre base presumida',
          amount: this.money(irCsll),
          rate: 0.24,
          basis: 'Base presumida orientativa para serviços.',
        },
        {
          code: 'PIS_COFINS_CUMULATIVE',
          label: 'PIS/COFINS cumulativo',
          amount: this.money(pisCofins),
          rate: 0.0365,
          basis: 'Estimativa de regime cumulativo.',
        },
        {
          code: 'ISS_ESTIMATE',
          label: 'ISS municipal estimado',
          amount: this.money(iss),
          rate: 0.03,
          basis: 'Alíquota média orientativa; confirmar município.',
        },
      ],
    });
  }

  private buildRecommendation(
    input: SimulateTaxScenarioDto,
    bestModel: TaxScenarioModel,
    comparisons: TaxScenarioCalculation[],
    factorRPercentage: number,
  ): TaxScenarioRecommendation {
    const current = input.currentModel;
    const currentResult = comparisons.find((item) => item.model === current);
    const bestResult = comparisons.find((item) => item.model === bestModel);
    const potentialGain =
      currentResult && bestResult
        ? this.money(bestResult.netAnnualResult - currentResult.netAnnualResult)
        : 0;

    if (factorRPercentage > 0 && factorRPercentage < FACTOR_R_THRESHOLD) {
      return {
        decision: 'SIMPLES_WITH_FACTOR_R_REVIEW',
        title: 'Revisar Fator R antes de decidir o modelo',
        rationale: [
          `Fator R estimado em ${factorRPercentage}%, abaixo do limiar de 28%.`,
          'A composição entre receita, folha e pró-labore pode alterar o anexo aplicável.',
        ],
        requiredEvidence: [
          'Folha dos últimos 12 meses',
          'Pró-labore dos sócios',
          'Receita bruta RBT12',
        ],
        nextActions: [
          'Validar CNAE',
          'Simular pró-labore assistido',
          'Submeter revisão CRC',
        ],
      };
    }

    if (bestModel !== 'PF') {
      return {
        decision: 'PJ_SIMULATION_RECOMMENDED',
        title: 'Estrutura PJ merece análise assistida',
        rationale: [
          `Modelo com melhor resultado estimado: ${bestModel}.`,
          potentialGain > 0
            ? `Ganho anual estimado contra o modelo atual: R$ ${potentialGain.toLocaleString('pt-BR')}.`
            : 'A comparação indica necessidade de detalhamento antes de decisão.',
        ],
        requiredEvidence: [
          'CNAE pretendido',
          'Município de prestação',
          'Notas/recibos recentes',
        ],
        nextActions: [
          'Rodar onboarding de abertura/migração',
          'Validar regime tributário',
          'Gerar proposta assistida',
        ],
      };
    }

    return {
      decision: 'ASSISTED_TAX_PLANNING_REQUIRED',
      title: 'Planejamento tributário assistido recomendado',
      rationale: [
        'O cenário não deve ser convertido automaticamente em decisão operacional.',
        'A estrutura ideal depende de atividade, município, deduções, retenções e obrigações acessórias.',
      ],
      requiredEvidence: [
        'Receitas por fonte',
        'Despesas dedutíveis',
        'Dependentes e retenções',
      ],
      nextActions: [
        'Solicitar documentos',
        'Validar base legal',
        'Emitir parecer contábil',
      ],
    };
  }

  private buildCalculation(
    input: Omit<
      TaxScenarioCalculation,
      'estimatedEffectiveRate' | 'netAnnualResult' | 'monthlyNetResult'
    >,
  ): TaxScenarioCalculation {
    const estimatedEffectiveRate =
      input.annualRevenue > 0 && input.estimatedTax >= 0
        ? this.round((input.estimatedTax / input.annualRevenue) * 100, 2)
        : 0;
    const netAnnualResult =
      input.estimatedTax >= 0
        ? this.money(
            input.annualRevenue -
              input.annualDeductibleExpenses -
              input.estimatedTax,
          )
        : 0;

    return {
      ...input,
      taxableBase: this.money(input.taxableBase),
      estimatedTax: this.money(input.estimatedTax),
      estimatedEffectiveRate,
      netAnnualResult,
      monthlyNetResult: this.money(netAnnualResult / 12),
    };
  }

  private progressiveIrpf(annualBase: number): number {
    if (annualBase <= 27_110.4) return 0;
    if (annualBase <= 33_919.8) return annualBase * 0.075 - 2_033.28;
    if (annualBase <= 45_012.6) return annualBase * 0.15 - 4_577.27;
    if (annualBase <= 55_976.16) return annualBase * 0.225 - 7_953.21;
    return annualBase * 0.275 - 10_752.02;
  }

  private money(value: number): number {
    return this.round(value, 2);
  }

  private round(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
}
