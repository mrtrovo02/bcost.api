import { Injectable } from '@nestjs/common';

export type PresumedProfitActivity = 'services_general' | 'commerce_industry';

export interface RegimeSimulationInput {
  revenue: number;
  months?: number;
  profitBeforeTaxes?: number;
  presumedActivity?: PresumedProfitActivity;
  issRate?: number;
  icmsRate?: number;
  pisCofinsCreditBase?: number;
}

export interface RegimeSimulationResult {
  assumptions: {
    sources: string[];
    caveat: string;
  };
  lucroPresumido: {
    irpj: number;
    irpjAdditional: number;
    csll: number;
    pis: number;
    cofins: number;
    iss: number;
    icms: number;
    total: number;
    effectiveRate: number;
  };
  lucroReal: {
    irpj: number;
    irpjAdditional: number;
    csll: number;
    pis: number;
    cofins: number;
    iss: number;
    icms: number;
    total: number;
    effectiveRate: number;
  };
}

const MONEY_PRECISION = 2;

const OFFICIAL_SOURCES = [
  'Receita Federal - IRPJ: aliquota geral de 15% e adicional de 10% sobre lucro acima de R$ 20.000,00 por mes.',
  'Receita Federal - CSLL: aliquota geral de 9% para pessoas juridicas em geral.',
  'Lei 9.718/1998 e regime cumulativo: PIS 0,65% e Cofins 3% como regra geral no Lucro Presumido.',
  'Leis 10.637/2002 e 10.833/2003: PIS 1,65% e Cofins 7,6% no regime nao cumulativo como regra geral.',
] as const;

@Injectable()
export class TaxRegimeSimulatorService {
  simulate(input: RegimeSimulationInput): RegimeSimulationResult {
    const revenue = Math.max(0, input.revenue);
    const months = Math.max(1, Math.trunc(input.months || 1));
    const issRate = this.normalizeRate(input.issRate);
    const icmsRate = this.normalizeRate(input.icmsRate);
    const profitBeforeTaxes =
      typeof input.profitBeforeTaxes === 'number'
        ? Math.max(0, input.profitBeforeTaxes)
        : revenue * this.getPresumption(input.presumedActivity || 'services_general').irpj;

    const presumed = this.calculateLucroPresumido({
      revenue,
      months,
      activity: input.presumedActivity || 'services_general',
      issRate,
      icmsRate,
    });

    const real = this.calculateLucroReal({
      revenue,
      months,
      profitBeforeTaxes,
      issRate,
      icmsRate,
      pisCofinsCreditBase: Math.max(0, input.pisCofinsCreditBase || 0),
    });

    return {
      assumptions: {
        sources: [...OFFICIAL_SOURCES],
        caveat:
          'Simulacao gerencial. CNAE, produto/servico, municipio, estado, beneficios fiscais, retencoes, creditos e ajustes do lucro real podem alterar a apuracao final.',
      },
      lucroPresumido: presumed,
      lucroReal: real,
    };
  }

  private calculateLucroPresumido(params: {
    revenue: number;
    months: number;
    activity: PresumedProfitActivity;
    issRate: number;
    icmsRate: number;
  }) {
    const presumption = this.getPresumption(params.activity);
    const irpjBase = params.revenue * presumption.irpj;
    const csllBase = params.revenue * presumption.csll;

    const irpj = irpjBase * 0.15;
    const irpjAdditional = Math.max(0, irpjBase - 20_000 * params.months) * 0.1;
    const csll = csllBase * 0.09;
    const pis = params.revenue * 0.0065;
    const cofins = params.revenue * 0.03;
    const iss = params.revenue * params.issRate;
    const icms = params.revenue * params.icmsRate;
    const total = irpj + irpjAdditional + csll + pis + cofins + iss + icms;

    return this.formatRegimeResult({
      irpj,
      irpjAdditional,
      csll,
      pis,
      cofins,
      iss,
      icms,
      total,
      revenue: params.revenue,
    });
  }

  private calculateLucroReal(params: {
    revenue: number;
    months: number;
    profitBeforeTaxes: number;
    issRate: number;
    icmsRate: number;
    pisCofinsCreditBase: number;
  }) {
    const irpj = params.profitBeforeTaxes * 0.15;
    const irpjAdditional = Math.max(0, params.profitBeforeTaxes - 20_000 * params.months) * 0.1;
    const csll = params.profitBeforeTaxes * 0.09;
    const pis = Math.max(0, params.revenue - params.pisCofinsCreditBase) * 0.0165;
    const cofins = Math.max(0, params.revenue - params.pisCofinsCreditBase) * 0.076;
    const iss = params.revenue * params.issRate;
    const icms = params.revenue * params.icmsRate;
    const total = irpj + irpjAdditional + csll + pis + cofins + iss + icms;

    return this.formatRegimeResult({
      irpj,
      irpjAdditional,
      csll,
      pis,
      cofins,
      iss,
      icms,
      total,
      revenue: params.revenue,
    });
  }

  private getPresumption(activity: PresumedProfitActivity) {
    if (activity === 'commerce_industry') {
      return { irpj: 0.08, csll: 0.12 };
    }

    return { irpj: 0.32, csll: 0.32 };
  }

  private normalizeRate(rate?: number): number {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return 0;
    return rate > 1 ? rate / 100 : Math.max(0, rate);
  }

  private money(value: number): number {
    return Number(value.toFixed(MONEY_PRECISION));
  }

  private formatRegimeResult(values: {
    irpj: number;
    irpjAdditional: number;
    csll: number;
    pis: number;
    cofins: number;
    iss: number;
    icms: number;
    total: number;
    revenue: number;
  }) {
    return {
      irpj: this.money(values.irpj),
      irpjAdditional: this.money(values.irpjAdditional),
      csll: this.money(values.csll),
      pis: this.money(values.pis),
      cofins: this.money(values.cofins),
      iss: this.money(values.iss),
      icms: this.money(values.icms),
      total: this.money(values.total),
      effectiveRate: values.revenue > 0 ? this.money((values.total / values.revenue) * 100) : 0,
    };
  }
}
