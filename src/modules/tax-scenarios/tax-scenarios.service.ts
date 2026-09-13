'use strict';

import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SimulateTaxScenarioDto } from './dto/simulate-tax-scenario.dto.js';
import { TAX_SCENARIO_REGRESSION_SUITE } from './tax-scenarios.regression-fixtures.js';
import {
  TaxCalculationAuditLine,
  TaxComplianceRuleEvaluation,
  TaxScenarioCalculation,
  TaxScenarioCalculationAudit,
  TaxScenarioComplianceTrail,
  TaxScenarioModel,
  TaxScenarioPreProposal,
  TaxScenarioPreProposalDocument,
  TaxScenarioRecommendation,
  TaxScenarioLegalRiskAssessment,
  TaxScenarioLegalSourceManifest,
  TaxScenarioServiceQualification,
  TaxScenarioSimulationResponse,
} from './tax-scenarios.types.js';

const MEI_ANNUAL_LIMIT = 81_000;
const SIMPLES_ANNUAL_LIMIT = 4_800_000;
const FACTOR_R_THRESHOLD = 28;
const CBS_INFORMATIVE_2026 = 0.009;
const IBS_INFORMATIVE_2026 = 0.001;

const TAX_SCENARIO_LEGAL_SOURCE_MANIFEST: TaxScenarioLegalSourceManifest = {
  version: 'tax-scenarios-legal-sources-2026.1',
  jurisdiction: 'BR',
  calculationMode: 'ESTIMATIVE_TRIAGE',
  officialAssessment: false,
  sources: [
    {
      code: 'EC_132_2023',
      title: 'Reforma tributária constitucional',
      sourceType: 'CONSTITUTIONAL_AMENDMENT',
      citation: 'Emenda Constitucional 132/2023',
      calculationRole:
        'Base normativa da transição para CBS/IBS e leitura de destaque informativo no ciclo 2026.',
    },
    {
      code: 'LC_214_2025',
      title: 'Lei Complementar de CBS/IBS',
      sourceType: 'COMPLEMENTARY_LAW',
      citation: 'Lei Complementar 214/2025',
      calculationRole:
        'Referência para premissas de calibração, governança e necessidade de atualização conforme atos complementares.',
    },
    {
      code: 'LC_123_2006',
      title: 'Simples Nacional, ME e EPP',
      sourceType: 'COMPLEMENTARY_LAW',
      citation: 'Lei Complementar 123/2006',
      calculationRole:
        'Limites de receita, fórmula de alíquota efetiva, anexos e regra do Fator R em simulação preliminar.',
    },
    {
      code: 'CGSN_140_2018',
      title: 'Regulamento do Simples Nacional',
      sourceType: 'REGULATION',
      citation: 'Resolução CGSN 140/2018',
      calculationRole:
        'Referência operacional para MEI, Simples Nacional, segregações e condicionantes não automatizadas.',
    },
    {
      code: 'RFB_IRPF',
      title: 'IRPF e livro caixa',
      sourceType: 'OFFICIAL_PORTAL',
      citation: 'Receita Federal do Brasil - orientações de IRPF e livro caixa vigentes',
      calculationRole:
        'Limita o cenário PF a estimativa preliminar dependente de documentação, retenções e dedutibilidade real.',
    },
    {
      code: 'BCOST_TAX_POLICY',
      title: 'Política bCost de simulação assistida',
      sourceType: 'SYSTEM_POLICY',
      citation: 'Tax by Design bCost - simulador não oficial sem revisão CRC',
      calculationRole:
        'Impede uso da simulação como apuração oficial, promessa de economia ou contratação automática sem evidência.',
    },
  ],
  revalidationTriggers: [
    'Publicação de nova lei complementar, resolução CGSN, ato declaratório, solução de consulta vinculante ou nota técnica de documento fiscal.',
    'Alteração de CNAE, município, natureza de serviço, retenções, folha, pró-labore, RBT12 ou regime tributário informado pelo cliente.',
    'Mudança anual de tabela de IRPF, limite aplicável, anexo do Simples, regra municipal de ISS ou política de split/payment tributário.',
  ],
  releaseGuardrails: [
    'Toda resposta deve manter officialAssessment=false enquanto não houver apuração documental e revisão de contador responsável.',
    'Toda economia estimada deve ser bloqueada para publicidade quando houver regra BLOCKED ou REQUIRES_REVIEW.',
    'Toda proposta gerada a partir do simulador deve exigir checklist documental e trilha de aceite de escopo.',
  ],
};

type SimplesBracket = {
  upperLimit: number;
  nominalRate: number;
  deduction: number;
};

const SIMPLES_ANNEX_III_BRACKETS: SimplesBracket[] = [
  { upperLimit: 180_000, nominalRate: 0.06, deduction: 0 },
  { upperLimit: 360_000, nominalRate: 0.112, deduction: 9_360 },
  { upperLimit: 720_000, nominalRate: 0.135, deduction: 17_640 },
  { upperLimit: 1_800_000, nominalRate: 0.16, deduction: 35_640 },
  { upperLimit: 3_600_000, nominalRate: 0.21, deduction: 125_640 },
  { upperLimit: 4_800_000, nominalRate: 0.33, deduction: 648_000 },
];

const SIMPLES_ANNEX_V_BRACKETS: SimplesBracket[] = [
  { upperLimit: 180_000, nominalRate: 0.155, deduction: 0 },
  { upperLimit: 360_000, nominalRate: 0.18, deduction: 4_500 },
  { upperLimit: 720_000, nominalRate: 0.195, deduction: 9_900 },
  { upperLimit: 1_800_000, nominalRate: 0.205, deduction: 17_100 },
  { upperLimit: 3_600_000, nominalRate: 0.23, deduction: 62_100 },
  { upperLimit: 4_800_000, nominalRate: 0.305, deduction: 540_000 },
];

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
      this.calculateMei(annualRevenue, annualPayroll),
      this.calculateSimples(
        input,
        annualRevenue,
        annualExpenses,
        annualPayroll,
        factorRPercentage,
      ),
      this.calculateLucroPresumido(input, annualRevenue, annualExpenses, annualPayroll),
    ];
    const viableComparisons = comparisons.filter(
      (item) =>
        item.estimatedTax >= 0 &&
        item.eligibilityStatus !== 'INELIGIBLE' &&
        item.eligibilityStatus !== 'REQUIRES_REVIEW',
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
      annualRevenue,
    );
    const complianceTrail = this.buildComplianceTrail(
      input,
      comparisons,
      annualRevenue,
      annualPayroll,
      factorRPercentage,
    );
    const calculationAudit = this.buildCalculationAudit(
      input,
      comparisons,
      annualRevenue,
      annualExpenses,
      annualPayroll,
      factorRPercentage,
      requiredPayrollForThreshold,
    );
    const serviceQualification = this.buildServiceQualification(
      recommendation,
      complianceTrail,
      best?.model ?? 'PF',
    );
    const preProposal = this.buildPreProposal(
      input,
      serviceQualification,
      complianceTrail,
    );
    const legalRiskAssessment = this.buildLegalRiskAssessment(
      complianceTrail,
      serviceQualification,
      preProposal,
    );

    return {
      status: 'OK',
      scenarioId: this.scenarioId(input),
      regressionSuite: {
        version: TAX_SCENARIO_REGRESSION_SUITE.version,
        owner: TAX_SCENARIO_REGRESSION_SUITE.owner,
        coveredRules: TAX_SCENARIO_REGRESSION_SUITE.coveredRules,
        blockingCriticalities: TAX_SCENARIO_REGRESSION_SUITE.blockingCriticalities,
      },
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
      complianceTrail,
      calculationAudit,
      serviceQualification,
      preProposal,
      legalRiskAssessment,
      legalSourceManifest: TAX_SCENARIO_LEGAL_SOURCE_MANIFEST,
      guardrails: [
        ...(annualRevenue > SIMPLES_ANNUAL_LIMIT
          ? [
              'Receita anualizada acima de R$ 4,8 milhões bloqueia recomendação automática de Simples Nacional; exigir RBT12 real e revisão contábil.',
            ]
          : []),
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

  private calculateMei(
    annualRevenue: number,
    annualPayroll: number,
  ): TaxScenarioCalculation {
    const overLimit = annualRevenue > MEI_ANNUAL_LIMIT;
    const payrollRequiresReview = annualPayroll > 0;
    const estimatedTax =
      overLimit || payrollRequiresReview ? -1 : this.money(85 * 12);

    return this.buildCalculation({
      model: 'MEI',
      eligibilityStatus: overLimit
        ? 'INELIGIBLE'
        : payrollRequiresReview
          ? 'REQUIRES_REVIEW'
          : 'ELIGIBLE',
      legalBasis: [
        'Portal gov.br/Empresas e Negócios: MEI pode faturar até R$ 81.000,00 por ano e contratar no máximo um empregado que receba salário mínimo ou piso da categoria.',
        'Resolução CGSN nº 140/2018, arts. 100, 101 e 105: ocupações permitidas e limites operacionais do SIMEI.',
      ],
      annualRevenue,
      annualDeductibleExpenses: 0,
      annualPayroll,
      taxableBase: annualRevenue,
      estimatedTax,
      warnings:
        overLimit
          ? [
              'Faturamento informado supera o limite anual usual do MEI; exige avaliação de desenquadramento.',
            ]
          : payrollRequiresReview
            ? [
                'MEI bloqueado para recomendação automática: há folha informada e o sistema ainda não validou quantidade de empregados, piso da categoria e ocupação permitida.',
              ]
            : ['MEI depende de atividade permitida e demais limites legais.'],
      components: [
        {
          code:
            overLimit || payrollRequiresReview
              ? 'MEI_ELIGIBILITY_REVIEW_REQUIRED'
              : 'MEI_FIXED_MONTHLY_DAS_ESTIMATE',
          label:
            overLimit || payrollRequiresReview
              ? 'Elegibilidade MEI exige revisão'
              : 'DAS mensal fixo estimado',
          amount: Math.max(0, estimatedTax),
          basis:
            overLimit || payrollRequiresReview
              ? 'Motor bloqueia recomendação automática de MEI quando limite de receita ou folha informada impedem validação segura sem evidências adicionais.'
              : 'Estimativa orientativa; valor real depende da atividade e legislação vigente.',
        },
      ],
    });
  }

  private calculateSimples(
    input: SimulateTaxScenarioDto,
    annualRevenue: number,
    annualExpenses: number,
    annualPayroll: number,
    factorRPercentage: number,
  ): TaxScenarioCalculation {
    const serviceActivity = [
      'LEGAL',
      'TECHNOLOGY',
      'CONSULTING',
      'SERVICE_PROVIDER',
    ].includes(input.activity);
    if (annualRevenue > SIMPLES_ANNUAL_LIMIT) {
      return this.buildCalculation({
        model: 'SIMPLES_NACIONAL',
        eligibilityStatus: 'INELIGIBLE',
        legalBasis: [
          'Lei Complementar 123/2006, art. 3º, II: limite de receita bruta anual de R$ 4.800.000,00 para EPP.',
        ],
        annualRevenue,
        annualDeductibleExpenses: annualExpenses,
        annualPayroll,
        taxableBase: annualRevenue,
        estimatedTax: -1,
        warnings: [
          'Simples Nacional bloqueado: receita anualizada supera R$ 4.800.000,00. Use Lucro Presumido/Lucro Real ou valide RBT12 real com contador responsável.',
        ],
        components: [
          {
            code: 'SIMPLES_REVENUE_LIMIT_BLOCKED',
            label: 'Limite anual do Simples Nacional excedido',
            amount: 0,
            basis:
              'LC 123/2006, art. 3º, II; motor não recomenda Simples quando a receita anualizada ultrapassa R$ 4,8 milhões.',
          },
        ],
      });
    }

    const annex =
      serviceActivity && factorRPercentage < FACTOR_R_THRESHOLD
        ? 'ANEXO_V'
        : 'ANEXO_III';
    const bracket = this.resolveSimplesBracket(
      annualRevenue,
      annex === 'ANEXO_III'
        ? SIMPLES_ANNEX_III_BRACKETS
        : SIMPLES_ANNEX_V_BRACKETS,
    );
    const effectiveRate =
      annualRevenue > 0
        ? Math.max(
            0,
            (annualRevenue * bracket.nominalRate - bracket.deduction) /
              annualRevenue,
          )
        : 0;
    const estimatedTax = this.money(annualRevenue * effectiveRate);

    return this.buildCalculation({
      model: 'SIMPLES_NACIONAL',
      eligibilityStatus: 'ELIGIBLE',
      legalBasis: [
        'Lei Complementar 123/2006, art. 18: alíquota efetiva = (RBT12 x alíquota nominal - parcela a deduzir) / RBT12.',
        'Lei Complementar 123/2006, Anexos III e V: aplicação conforme atividade e Fator R.',
      ],
      annualRevenue,
      annualDeductibleExpenses: annualExpenses,
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
            annex === 'ANEXO_III'
              ? 'SIMPLES_ANNEX_III_EFFECTIVE_RATE'
              : 'SIMPLES_ANNEX_V_EFFECTIVE_RATE',
          label:
            annex === 'ANEXO_III'
              ? 'Simples Nacional estimado pelo Anexo III'
              : 'Simples Nacional estimado pelo Anexo V',
          amount: estimatedTax,
          rate: this.round(effectiveRate, 6),
          basis:
            'Estimativa com fórmula de alíquota efetiva da LC 123/2006, dependente de RBT12, anexo, alíquota nominal e parcela a deduzir.',
        },
      ],
    });
  }

  private calculateLucroPresumido(
    input: SimulateTaxScenarioDto,
    annualRevenue: number,
    annualExpenses: number,
    annualPayroll: number,
  ): TaxScenarioCalculation {
    const presumedMargin = input.activity === 'HEALTHCARE' ? 0.32 : 0.32;
    const irCsll = annualRevenue * presumedMargin * 0.24;
    const pisCofins = annualRevenue * 0.0365;
    const iss = annualRevenue * 0.03;
    const estimatedTax = this.money(irCsll + pisCofins + iss);

    return this.buildCalculation({
      model: 'LUCRO_PRESUMIDO',
      annualRevenue,
      annualDeductibleExpenses: annualExpenses,
      annualPayroll,
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
    annualRevenue: number,
  ): TaxScenarioRecommendation {
    const current = input.currentModel;
    const currentResult = comparisons.find((item) => item.model === current);
    const bestResult = comparisons.find((item) => item.model === bestModel);
    const potentialGain =
      currentResult && bestResult && this.isSavingsComparable(currentResult)
        ? this.money(bestResult.netAnnualResult - currentResult.netAnnualResult)
        : 0;

    if (annualRevenue > SIMPLES_ANNUAL_LIMIT) {
      return {
        decision: 'ASSISTED_TAX_PLANNING_REQUIRED',
        title: 'Simples Nacional bloqueado pelo limite de receita',
        rationale: [
          'A receita anualizada supera R$ 4.800.000,00, limite geral de EPP para permanência no Simples Nacional.',
          `Modelo elegível com melhor resultado estimado: ${bestModel}.`,
        ],
        requiredEvidence: [
          'RBT12 oficial dos últimos 12 meses',
          'CNAE e segregação de receitas',
          'Município, retenções e ISS aplicável',
        ],
        nextActions: [
          'Bloquear proposta automática de Simples Nacional',
          'Rodar comparativo Lucro Presumido x Lucro Real',
          'Submeter revisão de contador responsável',
        ],
      };
    }

    if (bestModel === 'PF') {
      return {
        decision: 'PF_REVIEW_RECOMMENDED',
        title: 'PF permanece melhor na simulação preliminar',
        rationale: [
          'Com os valores informados, os regimes PJ elegíveis não superam o resultado líquido estimado da pessoa física.',
          ...(factorRPercentage > 0 && factorRPercentage < FACTOR_R_THRESHOLD
            ? [
                `Fator R estimado em ${factorRPercentage}%, abaixo do limiar de 28%; Simples para serviços tende a exigir Anexo V até revisão da folha/pró-labore.`,
              ]
            : []),
          'A conclusão depende de RBT12, CNAE, município, retenções, ISS, livro caixa e documentação fiscal real.',
        ],
        requiredEvidence: [
          'Recibos/notas e retenções dos últimos 12 meses',
          'Despesas dedutíveis com documentação hábil',
          'CNAE pretendido e município de prestação',
        ],
        nextActions: [
          'Manter recomendação como triagem, sem promessa de economia',
          'Validar livro caixa e retenções',
          'Submeter revisão CRC antes de proposta de migração',
        ],
      };
    }

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

    return {
      decision: 'PJ_SIMULATION_RECOMMENDED',
      title: 'Estrutura PJ merece análise assistida',
      rationale: [
        `Modelo com melhor resultado estimado: ${bestModel}.`,
        potentialGain > 0 && input.hasCrcReview === true
          ? `Diferença econômica revisada contra o modelo atual: R$ ${potentialGain.toLocaleString('pt-BR')}.`
          : potentialGain > 0
            ? `Diferença econômica preliminar identificada: R$ ${potentialGain.toLocaleString('pt-BR')}, condicionada à revisão CRC, RBT12, CNAE, município, retenções e documentação fiscal real.`
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

  private buildComplianceTrail(
    input: SimulateTaxScenarioDto,
    comparisons: TaxScenarioCalculation[],
    annualRevenue: number,
    annualPayroll: number,
    factorRPercentage: number,
  ): TaxScenarioComplianceTrail {
    const simples = comparisons.find(
      (comparison) => comparison.model === 'SIMPLES_NACIONAL',
    );
    const mei = comparisons.find((comparison) => comparison.model === 'MEI');
    const serviceActivity = [
      'LEGAL',
      'TECHNOLOGY',
      'CONSULTING',
      'SERVICE_PROVIDER',
    ].includes(input.activity);
    const rules: TaxComplianceRuleEvaluation[] = [
      {
        code: 'CBS_IBS_2026_CALIBRATION',
        status: 'INFORMATIONAL',
        severity: 'INFO',
        title: 'CBS/IBS 2026 em fase de teste',
        result:
          'Aplica destaque informativo de CBS 0,9% e IBS 0,1%, sem tratar como recolhimento definitivo.',
        legalBasis: [
          'EC 132/2023, art. 125: IBS 0,1% e CBS 0,9% em 2026.',
          'LC 214/2025: transição operacional e obrigações acessórias da reforma.',
        ],
        evidenceRequired: [
          'XML/JSON do documento fiscal com campos CBS/IBS individualizados',
          'CST, cClassTrib, NBS/CNAE e município do serviço',
        ],
        officialAssessment: false,
      },
      {
        code: 'SIMPLES_NACIONAL_REVENUE_LIMIT',
        status:
          annualRevenue > SIMPLES_ANNUAL_LIMIT ? 'BLOCKED' : 'PASSED',
        severity:
          annualRevenue > SIMPLES_ANNUAL_LIMIT ? 'CRITICAL' : 'INFO',
        title: 'Limite anual do Simples Nacional',
        result:
          annualRevenue > SIMPLES_ANNUAL_LIMIT
            ? 'Receita anualizada ultrapassa R$ 4.800.000,00; Simples Nacional não pode ser recomendado automaticamente.'
            : 'Receita anualizada dentro do limite geral de R$ 4.800.000,00 para análise preliminar.',
        legalBasis: [
          'Lei Complementar 123/2006, art. 3º, II: limite de receita bruta anual de R$ 4.800.000,00 para EPP.',
        ],
        evidenceRequired: [
          'RBT12 oficial',
          'Extrato PGDAS-D',
          'Segregação de receitas por anexo e município',
        ],
        officialAssessment: false,
      },
      {
        code: 'SIMPLES_EFFECTIVE_RATE_FORMULA',
        status:
          simples?.eligibilityStatus === 'ELIGIBLE'
            ? 'PASSED'
            : 'REQUIRES_REVIEW',
        severity:
          simples?.eligibilityStatus === 'ELIGIBLE' ? 'INFO' : 'HIGH',
        title: 'Fórmula de alíquota efetiva do Simples',
        result:
          simples?.eligibilityStatus === 'ELIGIBLE'
            ? 'Motor usa alíquota efetiva por RBT12, alíquota nominal e parcela a deduzir.'
            : 'Cálculo do Simples não deve virar recomendação enquanto houver inelegibilidade ou revisão pendente.',
        legalBasis: [
          'Lei Complementar 123/2006, art. 18 e Anexos III/V.',
        ],
        evidenceRequired: [
          'RBT12 real',
          'CNAE principal/secundário',
          'Receitas segregadas por atividade',
        ],
        officialAssessment: false,
      },
      {
        code: 'FACTOR_R_SERVICE_REVIEW',
        status:
          serviceActivity && factorRPercentage < FACTOR_R_THRESHOLD
            ? 'REQUIRES_REVIEW'
            : 'PASSED',
        severity:
          serviceActivity && factorRPercentage < FACTOR_R_THRESHOLD
            ? 'HIGH'
            : 'INFO',
        title: 'Fator R para serviços',
        result:
          serviceActivity && factorRPercentage < FACTOR_R_THRESHOLD
            ? 'Fator R abaixo de 28%; atividade de serviço tende a exigir revisão de Anexo V.'
            : 'Fator R não bloqueia a triagem preliminar com os valores informados.',
        legalBasis: [
          'Lei Complementar 123/2006, Anexos III/V e regras de Fator R para atividades sujeitas à comparação.',
        ],
        evidenceRequired: [
          'Folha dos últimos 12 meses',
          'Pró-labore dos sócios',
          'RBT12 oficial',
        ],
        officialAssessment: false,
      },
      {
        code: 'MEI_ELIGIBILITY',
        status:
          mei?.eligibilityStatus === 'ELIGIBLE'
            ? 'PASSED'
            : mei?.eligibilityStatus === 'INELIGIBLE'
              ? 'BLOCKED'
              : 'REQUIRES_REVIEW',
        severity:
          mei?.eligibilityStatus === 'ELIGIBLE'
            ? 'INFO'
            : mei?.eligibilityStatus === 'INELIGIBLE'
              ? 'CRITICAL'
              : 'HIGH',
        title: 'Elegibilidade MEI',
        result:
          mei?.eligibilityStatus === 'ELIGIBLE'
            ? 'Receita dentro do limite anual e sem folha informada na triagem.'
            : annualPayroll > 0
              ? 'Há folha informada; MEI exige validação de empregado único, salário mínimo/piso da categoria e ocupação permitida.'
              : 'Receita ultrapassa limite anual do MEI.',
        legalBasis: [
          'Portal gov.br/Empresas e Negócios: limite anual do MEI e contratação de no máximo um empregado.',
          'Resolução CGSN nº 140/2018, arts. 100, 101 e 105.',
        ],
        evidenceRequired: [
          'Ocupação MEI permitida',
          'Comprovante de ausência de sócio/filial',
          'Quantidade de empregados e remuneração',
        ],
        officialAssessment: false,
      },
      {
        code: 'OFFICIAL_ASSESSMENT_LOCK',
        status: 'REQUIRES_REVIEW',
        severity: 'HIGH',
        title: 'Bloqueio de apuração oficial automática',
        result:
          'Resultado classificado como triagem estimativa; decisão final exige escrituração, documentos fiscais e validação CRC.',
        legalBasis: [
          'Código Tributário Nacional: lançamento e constituição do crédito tributário dependem de hipótese, base e documentação idônea.',
          'Normas profissionais contábeis aplicáveis à responsabilidade técnica do contador.',
        ],
        evidenceRequired: [
          'XML/NFS-e/NF-e',
          'Livro caixa ou escrituração',
          'Retenções, guias, extratos e documentos suporte',
        ],
        officialAssessment: false,
      },
    ];
    const commercialDecision = this.buildCommercialDecision(
      rules,
      input.currentModel,
      comparisons.find((comparison) => comparison.model === 'PF')
        ? comparisons
            .filter((comparison) => this.isSavingsComparable(comparison))
            .sort((a, b) => b.netAnnualResult - a.netAnnualResult)[0]?.model
        : undefined,
    );

    return {
      version: 'tax-scenarios-compliance-2026.1',
      calculationMode: 'ESTIMATIVE_TRIAGE',
      officialAssessment: false,
      evaluatedAt: new Date().toISOString(),
      commercialDecision,
      rules,
      disclaimers: [
        'Este simulador não substitui apuração oficial, PGDAS-D, escrituração contábil/fiscal, DIRPF ou parecer de contador responsável.',
        'A recomendação comercial deve ser bloqueada quando houver status BLOCKED ou REQUIRES_REVIEW sem evidência validada.',
      ],
    };
  }

  private buildCommercialDecision(
    rules: TaxComplianceRuleEvaluation[],
    currentModel?: TaxScenarioModel,
    bestModel?: TaxScenarioModel,
  ): TaxScenarioComplianceTrail['commercialDecision'] {
    const blockedRules = rules.filter(
      (rule) =>
        rule.status === 'BLOCKED' &&
        this.isBlockingRuleRelevantForCommercialDecision(
          rule.code,
          currentModel,
          bestModel,
        ),
    );
    const reviewRules = rules.filter(
      (rule) => rule.status === 'REQUIRES_REVIEW',
    );
    const operationalReviewRules = reviewRules.filter(
      (rule) => rule.code !== 'OFFICIAL_ASSESSMENT_LOCK',
    );
    const status =
      blockedRules.length > 0
        ? 'BLOCKED_BY_COMPLIANCE'
        : operationalReviewRules.length > 0
          ? 'ASSISTED_REVIEW_REQUIRED'
          : 'ASSISTED_REVIEW_REQUIRED';

    return {
      status,
      canGenerateProposal:
        status !== 'BLOCKED_BY_COMPLIANCE' &&
        operationalReviewRules.length === 0,
      requiresCrcReview: true,
      reasons: [
        ...blockedRules.map((rule) => rule.result),
        ...operationalReviewRules.map((rule) => rule.result),
        'Toda proposta comercial tributária deve ser revisada por contador responsável antes de contratação.',
      ],
      blockedRuleCodes: blockedRules.map((rule) => rule.code),
      reviewRuleCodes: reviewRules.map((rule) => rule.code),
    };
  }

  private isBlockingRuleRelevantForCommercialDecision(
    ruleCode: string,
    currentModel?: TaxScenarioModel,
    bestModel?: TaxScenarioModel,
  ): boolean {
    if (ruleCode === 'MEI_ELIGIBILITY') {
      return currentModel === 'MEI' || bestModel === 'MEI';
    }

    if (ruleCode === 'SIMPLES_NACIONAL_REVENUE_LIMIT') {
      return (
        currentModel === 'SIMPLES_NACIONAL' ||
        bestModel === 'SIMPLES_NACIONAL'
      );
    }

    return true;
  }

  private buildCalculationAudit(
    input: SimulateTaxScenarioDto,
    comparisons: TaxScenarioCalculation[],
    annualRevenue: number,
    annualExpenses: number,
    annualPayroll: number,
    factorRPercentage: number,
    requiredPayrollForThreshold: number,
  ): TaxScenarioCalculationAudit {
    const findComparison = (model: TaxScenarioModel) =>
      comparisons.find((comparison) => comparison.model === model);
    const pf = findComparison('PF');
    const mei = findComparison('MEI');
    const simples = findComparison('SIMPLES_NACIONAL');
    const lucroPresumido = findComparison('LUCRO_PRESUMIDO');
    const lines: TaxCalculationAuditLine[] = [
      {
        code: 'NORMALIZED_ANNUAL_INPUTS',
        title: 'Entradas anualizadas',
        formula: 'valor_mensal * 12',
        inputs: {
          monthlyRevenue: input.monthlyRevenue,
          monthlyDeductibleExpenses: input.monthlyDeductibleExpenses,
          monthlyPayroll: input.monthlyPayroll,
        },
        result: `Receita ${annualRevenue}; despesas ${annualExpenses}; folha ${annualPayroll}`,
        sourceBasis: [
          'Critério matemático de anualização para triagem; RBT12 oficial deve ser informado para apuração final.',
        ],
        officialAssessment: false,
      },
      {
        code: 'FACTOR_R',
        title: 'Fator R',
        formula: 'folha_12_meses / receita_bruta_12_meses * 100',
        inputs: {
          annualPayroll,
          annualRevenue,
          thresholdPercentage: FACTOR_R_THRESHOLD,
        },
        result: factorRPercentage,
        sourceBasis: [
          'Lei Complementar 123/2006, Anexos III/V e regras de segregação por atividade sujeita ao Fator R.',
        ],
        officialAssessment: false,
      },
      {
        code: 'PF_IRPF_ESTIMATE',
        title: 'IRPF pessoa física estimado',
        formula:
          'max(0, receita_anual - despesas_dedutiveis - dependentes * deducao_anual) aplicado à tabela progressiva anualizada',
        inputs: {
          taxableBase: pf?.taxableBase ?? 0,
          dependents: input.dependents,
          estimatedTax: pf?.estimatedTax ?? 0,
        },
        result: pf?.estimatedTax ?? 0,
        sourceBasis: [
          'Tabela progressiva mensal do IRPF anualizada para simulação preliminar.',
          'RIR/2018 e regras de DIRPF/livro caixa dependem de documentação idônea.',
        ],
        officialAssessment: false,
      },
      {
        code: 'MEI_ELIGIBILITY_AND_DAS',
        title: 'MEI elegibilidade e DAS estimado',
        formula:
          'receita_anual <= 81.000 e ausência de folha não validada; DAS fixo orientativo quando elegível',
        inputs: {
          annualRevenue,
          annualPayroll,
          annualLimit: MEI_ANNUAL_LIMIT,
          eligibilityStatus: mei?.eligibilityStatus ?? 'REQUIRES_REVIEW',
        },
        result: mei?.estimatedTax ?? -1,
        sourceBasis: [
          'Portal gov.br/Empresas e Negócios: limite anual MEI e contratação de no máximo um empregado.',
          'Resolução CGSN nº 140/2018.',
        ],
        officialAssessment: false,
      },
      {
        code: 'SIMPLES_EFFECTIVE_RATE',
        title: 'Simples Nacional estimado',
        formula:
          '(RBT12 * aliquota_nominal - parcela_a_deduzir) / RBT12; tributo = receita_anual * aliquota_efetiva',
        inputs: {
          annualRevenue,
          annualLimit: SIMPLES_ANNUAL_LIMIT,
          effectiveRate: simples?.estimatedEffectiveRate ?? 0,
          eligibilityStatus: simples?.eligibilityStatus ?? 'REQUIRES_REVIEW',
        },
        result: simples?.estimatedTax ?? -1,
        sourceBasis: [
          'Lei Complementar 123/2006, art. 18 e Anexos III/V.',
        ],
        officialAssessment: false,
      },
      {
        code: 'LUCRO_PRESUMIDO_ESTIMATE',
        title: 'Lucro Presumido estimado',
        formula:
          'receita * margem_presumida * IRPJ/CSLL + receita * PIS/COFINS cumulativo + receita * ISS estimado',
        inputs: {
          annualRevenue,
          presumedTaxableBase: lucroPresumido?.taxableBase ?? 0,
          estimatedTax: lucroPresumido?.estimatedTax ?? 0,
        },
        result: lucroPresumido?.estimatedTax ?? 0,
        sourceBasis: [
          'Regime de Lucro Presumido exige validação de atividade, adicional de IRPJ, retenções, ISS municipal e demais receitas.',
        ],
        officialAssessment: false,
      },
      {
        code: 'CBS_IBS_INFORMATIVE_2026',
        title: 'CBS/IBS informativo 2026',
        formula: 'receita_anual * CBS 0,9%; receita_anual * IBS 0,1%',
        inputs: {
          annualRevenue,
          cbsRate: CBS_INFORMATIVE_2026,
          ibsRate: IBS_INFORMATIVE_2026,
        },
        result: `CBS ${this.money(annualRevenue * CBS_INFORMATIVE_2026)}; IBS ${this.money(annualRevenue * IBS_INFORMATIVE_2026)}`,
        sourceBasis: ['EC 132/2023, art. 125; LC 214/2025.'],
        officialAssessment: false,
      },
      {
        code: 'PAYROLL_REQUIRED_FOR_FACTOR_R',
        title: 'Folha necessária para Fator R de 28%',
        formula: 'max(0, receita_anual * 28% - folha_anual)',
        inputs: {
          annualRevenue,
          annualPayroll,
          thresholdPercentage: FACTOR_R_THRESHOLD,
        },
        result: requiredPayrollForThreshold,
        sourceBasis: [
          'Cálculo gerencial para planejamento assistido; não altera regime sem validação de folha e pró-labore.',
        ],
        officialAssessment: false,
      },
    ];

    return {
      version: 'tax-scenarios-calculation-audit-2026.1',
      generatedAt: new Date().toISOString(),
      lines,
    };
  }

  private buildServiceQualification(
    recommendation: TaxScenarioRecommendation,
    complianceTrail: TaxScenarioComplianceTrail,
    bestModel: TaxScenarioModel,
  ): TaxScenarioServiceQualification {
    const commercialDecision = complianceTrail.commercialDecision;
    const missingEvidence = Array.from(
      new Set(
        complianceTrail.rules
          .filter(
            (rule) =>
              rule.status === 'BLOCKED' ||
              rule.status === 'REQUIRES_REVIEW',
          )
          .flatMap((rule) => rule.evidenceRequired),
      ),
    );

    if (commercialDecision.status === 'BLOCKED_BY_COMPLIANCE') {
      return {
        stage: 'BLOCKED',
        primaryOffer: {
          sku: 'COMPLIANCE_BLOCKER_REVIEW',
          title: 'Revisão de bloqueio fiscal antes da proposta',
          checkoutMode: 'BLOCKED',
        },
        allowedActions: [
          'REQUEST_DOCUMENTS',
          'SCHEDULE_CRC_REVIEW',
          'BLOCK_AUTOMATIC_CHECKOUT',
        ],
        missingEvidence,
        salesWarnings: [
          'Não apresentar economia, migração ou enquadramento enquanto houver regra crítica bloqueada.',
          ...commercialDecision.reasons,
        ],
      };
    }

    if (bestModel === 'PF') {
      return {
        stage: 'NEEDS_DISCOVERY',
        primaryOffer: {
          sku: 'PF_TAX_REVIEW',
          title: 'Revisão fiscal PF e livro caixa',
          checkoutMode: 'SALES_REVIEW_ONLY',
        },
        allowedActions: ['REQUEST_DOCUMENTS', 'SCHEDULE_CRC_REVIEW'],
        missingEvidence,
        salesWarnings: [
          'Não vender abertura ou migração PJ com base neste cenário preliminar.',
          'Oferta indicada: diagnóstico PF, livro caixa, retenções e validação documental.',
        ],
      };
    }

    if (recommendation.decision === 'SIMPLES_WITH_FACTOR_R_REVIEW') {
      return {
        stage: 'NEEDS_DISCOVERY',
        primaryOffer: {
          sku: 'TAX_REGIME_CRC_REVIEW',
          title: 'Revisão CRC de Fator R e regime tributário',
          checkoutMode: 'SALES_REVIEW_ONLY',
        },
        allowedActions: ['REQUEST_DOCUMENTS', 'SCHEDULE_CRC_REVIEW'],
        missingEvidence,
        salesWarnings: [
          'Não prometer enquadramento no Anexo III antes de validar folha, pró-labore e RBT12.',
        ],
      };
    }

    return {
      stage: 'QUALIFIED_LEAD',
      primaryOffer: {
        sku: 'PJ_MIGRATION_STUDY',
        title: 'Estudo assistido de abertura ou migração PJ',
        checkoutMode: commercialDecision.canGenerateProposal
          ? 'ASSISTED_CHECKOUT'
          : 'SALES_REVIEW_ONLY',
      },
      allowedActions: commercialDecision.canGenerateProposal
        ? ['REQUEST_DOCUMENTS', 'SCHEDULE_CRC_REVIEW', 'CREATE_ASSISTED_PROPOSAL']
        : ['REQUEST_DOCUMENTS', 'SCHEDULE_CRC_REVIEW'],
      missingEvidence,
      salesWarnings: [
        'Proposta deve manter cláusula de estimativa e revisão CRC antes de enquadramento definitivo.',
      ],
    };
  }

  private buildPreProposal(
    input: SimulateTaxScenarioDto,
    serviceQualification: TaxScenarioServiceQualification,
    complianceTrail: TaxScenarioComplianceTrail,
  ): TaxScenarioPreProposal {
    const checkoutAllowed =
      serviceQualification.primaryOffer.checkoutMode === 'ASSISTED_CHECKOUT' &&
      complianceTrail.commercialDecision.canGenerateProposal;
    const status = this.resolvePreProposalStatus(serviceQualification);
    const title = this.resolvePreProposalTitle(serviceQualification, status);
    const riskLevel = this.resolvePreProposalRiskLevel(complianceTrail);
    const documentChecklist = this.buildPreProposalDocuments(serviceQualification);

    return {
      id: this.scenarioId({
        ...input,
        currentModel: input.currentModel ?? 'PF',
      }),
      status,
      riskLevel,
      readinessScore: this.calculateReadinessScore(
        status,
        riskLevel,
        documentChecklist,
        complianceTrail,
      ),
      validUntil: this.resolvePreProposalValidityDate(),
      title,
      ctaLabel: this.resolvePreProposalCtaLabel(status, checkoutAllowed),
      nextRoute: this.resolvePreProposalRoute(status, checkoutAllowed),
      checkoutAllowed,
      serviceSku: serviceQualification.primaryOffer.sku,
      checkoutMode: serviceQualification.primaryOffer.checkoutMode,
      documentChecklist,
      blockingReasons: complianceTrail.commercialDecision.blockedRuleCodes,
      reviewReasons: complianceTrail.commercialDecision.reviewRuleCodes,
      refreshTriggers: [
        'Alteração de faturamento, folha, pró-labore, dependentes, CNAE, município ou regime atual.',
        'Recebimento de RBT12 oficial, XMLs, notas, retenções, extratos ou escrituração que divirjam dos valores simulados.',
        'Publicação de ato legal, nota técnica, tabela ou orientação fiscal que altere alíquotas, limites, anexos ou obrigações aplicáveis.',
      ],
      legalTerms: [
        'Pré-proposta condicionada à validação documental, CNAE, município, RBT12, retenções, folha/pró-labore e revisão de contador responsável.',
        'A simulação é estimativa de triagem e não representa apuração oficial, parecer tributário definitivo ou promessa de economia.',
        'Contratação, abertura, migração, enquadramento e desenquadramento devem manter evidências arquivadas para trilha de auditoria.',
      ],
    };
  }

  private buildLegalRiskAssessment(
    complianceTrail: TaxScenarioComplianceTrail,
    serviceQualification: TaxScenarioServiceQualification,
    preProposal: TaxScenarioPreProposal,
  ): TaxScenarioLegalRiskAssessment {
    const reviewedRules = complianceTrail.rules.filter(
      (rule) =>
        rule.status === 'BLOCKED' || rule.status === 'REQUIRES_REVIEW',
    );
    const missingEvidence = Array.from(
      new Set([
        ...serviceQualification.missingEvidence,
        ...preProposal.documentChecklist
          .filter((document) => document.required)
          .map((document) => document.label),
      ]),
    );
    const legalReliability: TaxScenarioLegalRiskAssessment['legalReliability'] =
      preProposal.status === 'BLOCKED_BY_COMPLIANCE'
        ? 'BLOCKED_FOR_AUTOMATED_SALE'
        : preProposal.checkoutAllowed
          ? 'ASSISTED_REVIEW_REQUIRED'
          : 'TRIAGE_ONLY';
    const evidenceStatus: TaxScenarioLegalRiskAssessment['evidenceGate']['status'] =
      preProposal.status === 'BLOCKED_BY_COMPLIANCE'
        ? 'BLOCKED'
        : missingEvidence.length > 0
          ? 'OPEN'
          : 'READY_FOR_CRC_REVIEW';

    return {
      version: 'tax-scenarios-legal-risk-2026.1',
      assessmentMode: 'CODE_BASED_SYSTEMIC_REVIEW',
      legalReliability,
      riskLevel: preProposal.riskLevel,
      canAdvertiseSavings:
        preProposal.checkoutAllowed &&
        evidenceStatus === 'READY_FOR_CRC_REVIEW' &&
        reviewedRules.length === 0 &&
        preProposal.riskLevel !== 'HIGH' &&
        preProposal.riskLevel !== 'CRITICAL',
      canUseAsOfficialAssessment: false,
      requiredDisclosures: [
        'Resultado gerencial para triagem e planejamento assistido, sem substituir apuração oficial ou parecer tributário.',
        'Economia, enquadramento e migração dependem de RBT12, CNAE, município, retenções, folha/pró-labore e documentos fiscais reais.',
        'CBS/IBS 2026 deve ser tratado como destaque informativo de calibração operacional, não como recolhimento definitivo automático.',
        'Proposta comercial tributária exige dossiê de evidências e revisão de contador responsável antes da contratação.',
      ],
      evidenceGate: {
        status: evidenceStatus,
        requiredEvidence: preProposal.documentChecklist
          .filter((document) => document.required)
          .map((document) => document.label),
        missingEvidence,
      },
      findings: reviewedRules.map((rule) => ({
        code: rule.code,
        severity: rule.severity,
        title: rule.title,
        impact:
          rule.status === 'BLOCKED'
            ? 'Bloqueia venda automática, promessa de economia ou recomendação de enquadramento.'
            : 'Exige revisão assistida antes de orientar contratação, abertura, migração ou alteração de regime.',
        correctiveAction:
          rule.status === 'BLOCKED'
            ? 'Abrir revisão de compliance, coletar evidências oficiais e reprocessar o cenário antes de qualquer proposta.'
            : 'Coletar evidências exigidas, registrar memória de cálculo e submeter validação CRC.',
        sourceBasis: rule.legalBasis,
      })),
    };
  }

  private resolvePreProposalValidityDate(): string {
    const validUntil = new Date();
    validUntil.setUTCDate(validUntil.getUTCDate() + 7);
    return validUntil.toISOString();
  }

  private resolvePreProposalRiskLevel(
    complianceTrail: TaxScenarioComplianceTrail,
  ): TaxScenarioPreProposal['riskLevel'] {
    const relevantRuleCodes = new Set([
      ...complianceTrail.commercialDecision.blockedRuleCodes,
      ...complianceTrail.commercialDecision.reviewRuleCodes,
    ]);
    const severities = complianceTrail.rules
      .filter((rule) => relevantRuleCodes.has(rule.code))
      .map((rule) => rule.severity);

    if (severities.includes('CRITICAL')) return 'CRITICAL';
    if (severities.includes('HIGH')) return 'HIGH';
    if (severities.includes('MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  private calculateReadinessScore(
    status: TaxScenarioPreProposal['status'],
    riskLevel: TaxScenarioPreProposal['riskLevel'],
    documentChecklist: TaxScenarioPreProposalDocument[],
    complianceTrail: TaxScenarioComplianceTrail,
  ): number {
    const requiredDocuments = documentChecklist.filter((document) => document.required).length;
    const reviewPenalty = complianceTrail.commercialDecision.reviewRuleCodes.length * 8;
    const blockingPenalty = complianceTrail.commercialDecision.blockedRuleCodes.length * 25;
    const riskPenaltyByLevel: Record<TaxScenarioPreProposal['riskLevel'], number> = {
      LOW: 0,
      MEDIUM: 8,
      HIGH: 18,
      CRITICAL: 35,
    };
    const statusPenaltyByStatus: Record<TaxScenarioPreProposal['status'], number> = {
      READY_FOR_ASSISTED_REVIEW: 0,
      NEEDS_DISCOVERY: 12,
      BLOCKED_BY_COMPLIANCE: 30,
    };
    const score =
      100 -
      requiredDocuments * 2 -
      reviewPenalty -
      blockingPenalty -
      riskPenaltyByLevel[riskLevel] -
      statusPenaltyByStatus[status];

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private resolvePreProposalStatus(
    serviceQualification: TaxScenarioServiceQualification,
  ): TaxScenarioPreProposal['status'] {
    if (serviceQualification.stage === 'BLOCKED') {
      return 'BLOCKED_BY_COMPLIANCE';
    }

    if (serviceQualification.stage === 'NEEDS_DISCOVERY') {
      return 'NEEDS_DISCOVERY';
    }

    return 'READY_FOR_ASSISTED_REVIEW';
  }

  private resolvePreProposalTitle(
    serviceQualification: TaxScenarioServiceQualification,
    status: TaxScenarioPreProposal['status'],
  ): string {
    if (status === 'BLOCKED_BY_COMPLIANCE') {
      return 'Dossiê bloqueado para venda automática';
    }

    if (status === 'NEEDS_DISCOVERY') {
      return 'Dossiê para diagnóstico assistido';
    }

    return `Pré-proposta assistida: ${serviceQualification.primaryOffer.title}`;
  }

  private resolvePreProposalCtaLabel(
    status: TaxScenarioPreProposal['status'],
    checkoutAllowed: boolean,
  ): string {
    if (status === 'BLOCKED_BY_COMPLIANCE') {
      return 'Abrir revisão de compliance';
    }

    if (checkoutAllowed) {
      return 'Preparar proposta assistida';
    }

    return 'Enviar evidências para CRC';
  }

  private resolvePreProposalRoute(
    status: TaxScenarioPreProposal['status'],
    checkoutAllowed: boolean,
  ): TaxScenarioPreProposal['nextRoute'] {
    if (status === 'BLOCKED_BY_COMPLIANCE') {
      return '/dashboard/modules/audit-intelligence';
    }

    if (checkoutAllowed) {
      return '/dashboard/settings?section=billing';
    }

    return '/dashboard/modules/company-formation';
  }

  private buildPreProposalDocuments(
    serviceQualification: TaxScenarioServiceQualification,
  ): TaxScenarioPreProposalDocument[] {
    const baseDocuments: TaxScenarioPreProposalDocument[] = [
      {
        code: 'CNAE_AND_MUNICIPALITY',
        label: 'CNAE pretendido, município de prestação e descrição real dos serviços',
        required: true,
        source: 'CUSTOMER',
      },
      {
        code: 'RBT12_AND_REVENUE_SEGREGATION',
        label: 'Receita bruta dos últimos 12 meses e segregação por tipo de serviço',
        required: true,
        source: 'CUSTOMER',
      },
      {
        code: 'FISCAL_DOCUMENTS_SAMPLE',
        label: 'Amostra de notas fiscais, recibos, retenções e contratos vigentes',
        required: true,
        source: 'CUSTOMER',
      },
      {
        code: 'PAYROLL_AND_PRO_LABORE',
        label: 'Folha, pró-labore, INSS e vínculos usados no Fator R',
        required: true,
        source: 'ACCOUNTANT',
      },
    ];
    const evidenceDocuments = serviceQualification.missingEvidence.map(
      (evidence) => this.mapEvidenceToDocument(evidence),
    );
    const uniqueDocuments = new Map<string, TaxScenarioPreProposalDocument>();

    [...baseDocuments, ...evidenceDocuments].forEach((document) => {
      uniqueDocuments.set(document.code, document);
    });

    return Array.from(uniqueDocuments.values());
  }

  private mapEvidenceToDocument(evidence: string): TaxScenarioPreProposalDocument {
    const normalizedEvidence = evidence
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    if (normalizedEvidence.includes('RBT12')) {
      return {
        code: 'OFFICIAL_RBT12',
        label: 'RBT12 oficial extraído do PGDAS-D ou escrituração equivalente',
        required: true,
        source: 'ACCOUNTANT',
      };
    }

    if (
      normalizedEvidence.includes('FOLHA') ||
      normalizedEvidence.includes('PRO-LABORE') ||
      normalizedEvidence.includes('PRO LABORE')
    ) {
      return {
        code: 'PAYROLL_FACTOR_R_EVIDENCE',
        label: 'Comprovantes de folha e pró-labore para validação do Fator R',
        required: true,
        source: 'ACCOUNTANT',
      };
    }

    if (
      normalizedEvidence.includes('CNAE') ||
      normalizedEvidence.includes('ATIVIDADE') ||
      normalizedEvidence.includes('OCUPACAO')
    ) {
      return {
        code: 'ACTIVITY_ELIGIBILITY_EVIDENCE',
        label: 'CNAE, ocupação permitida e objeto social compatíveis com a operação',
        required: true,
        source: 'CUSTOMER',
      };
    }

    if (
      normalizedEvidence.includes('NOTA') ||
      normalizedEvidence.includes('XML') ||
      normalizedEvidence.includes('RECIBO') ||
      normalizedEvidence.includes('RETENCAO')
    ) {
      return {
        code: 'DOCUMENT_AND_WITHHOLDING_EVIDENCE',
        label: 'Notas, XMLs, recibos e retenções dos últimos 12 meses',
        required: true,
        source: 'CUSTOMER',
      };
    }

    return {
      code: `EVIDENCE_${createHash('sha1').update(evidence).digest('hex').slice(0, 8).toUpperCase()}`,
      label: evidence,
      required: true,
      source: 'CUSTOMER',
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
              input.annualPayroll -
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

  private isSavingsComparable(calculation: TaxScenarioCalculation): boolean {
    return (
      calculation.estimatedTax >= 0 &&
      calculation.eligibilityStatus !== 'INELIGIBLE' &&
      calculation.eligibilityStatus !== 'REQUIRES_REVIEW'
    );
  }

  private progressiveIrpf(annualBase: number): number {
    if (annualBase <= 29_145.6) return 0;
    if (annualBase <= 33_919.8) return annualBase * 0.075 - 2_185.92;
    if (annualBase <= 45_012.6) return annualBase * 0.15 - 4_729.92;
    if (annualBase <= 55_976.16) return annualBase * 0.225 - 8_105.88;
    return annualBase * 0.275 - 10_904.76;
  }

  private resolveSimplesBracket(
    annualRevenue: number,
    brackets: SimplesBracket[],
  ): SimplesBracket {
    return (
      brackets.find((bracket) => annualRevenue <= bracket.upperLimit) ??
      brackets[brackets.length - 1]
    );
  }

  private money(value: number): number {
    return this.round(value, 2);
  }

  private round(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
}
