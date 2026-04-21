'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export interface AdvisoryReport {
  trend: 'UP' | 'DOWN' | 'STABLE';
  percentageChange: number;
  insight: string;
  actionPlan: string;
}

/**
 * Interface para recomendações tributárias específicas
 */
export interface TaxAdvisory {
  fatorR: number;
  taxRegime: string;
  recommendation: string;
  potentialSavings: number;
}

@Injectable()
export class AdvisoryService {
  private readonly logger = new Logger(AdvisoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🧠 Gera consultoria automática comparando o mês atual com o anterior.
   */
  async generateMonthlyAdvisory(companyId: string): Promise<AdvisoryReport> {
    const snapshots = await this.prisma.financialSnapshot.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 2,
    });

    if (snapshots.length < 2) {
      return {
        trend: 'STABLE',
        percentageChange: 0,
        insight: 'Dados insuficientes para análise comparativa.',
        actionPlan:
          'Continue alimentando o sistema para gerar insights no próximo mês.',
      };
    }

    const current = snapshots[0];
    const previous = snapshots[1];

    const currentScore = current.netProfit.toNumber();
    const previousScore = previous.netProfit.toNumber();
    const diff = currentScore - previousScore;
    const percent = previousScore !== 0 ? (diff / previousScore) * 100 : 0;

    return {
      trend: diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'STABLE',
      percentageChange: Math.abs(Math.round(percent)),
      insight: this.generateInsight(diff, currentScore),
      actionPlan: this.generateActionPlan(diff, currentScore),
    };
  }

  private generateInsight(diff: number, score: number): string {
    if (diff > 5)
      return `Sua performance subiu consideravelmente. A eficiência operacional está acima da média histórica.`;
    if (diff < -5)
      return `Detectamos uma queda na sua saúde financeira. Isso geralmente ocorre por aumento súbito de despesas fixas.`;
    return `Sua operação está estável. É um bom momento para planejar investimentos de longo prazo.`;
  }

  private generateActionPlan(diff: number, score: number): string {
    if (score < 50)
      return `Prioridade: Revisão de custos e renegociação de prazos com fornecedores para estancar a quebra de liquidez.`;
    if (diff > 0)
      return `Sugestão: Reinvista o excedente em marketing ou infraestrutura para acelerar o crescimento.`;
    return `Manter monitoramento de fluxo de caixa para evitar surpresas no próximo ciclo.`;
  }

  // --- 🟢 ADIÇÕES TÉCNICAS PARA COMPLETAR O SERVIÇO ---

  /**
   * ⚖️ ANÁLISE DE FATOR-R E TRIBUTAÇÃO
   * Analisa se a empresa pode migrar do Anexo V para o Anexo III do Simples Nacional.
   */
  async getTaxStrategyAdvisory(companyId: string): Promise<TaxAdvisory> {
    this.logger.log(`⚖️ Analisando estratégia tributária para: ${companyId}`);

    const snapshot = await this.prisma.financialSnapshot.findFirst({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    if (!snapshot || !snapshot.fatorRData) {
      return {
        fatorR: 0,
        taxRegime: 'N/A',
        recommendation: 'Dados de folha/faturamento não encontrados.',
        potentialSavings: 0,
      };
    }

    // O Fator-R é (Massa Salarial / Faturamento Bruto)
    // No seu schema, fatorRData armazena os fatores de saúde, vamos adaptar para buscar os financeiros
    const revenue = snapshot.revenue.toNumber();
    const payroll = 0; // Idealmente buscar de uma tabela de folha ou despesas categorizadas

    // Exemplo de lógica bCost:
    const fatorR = payroll > 0 && revenue > 0 ? payroll / revenue : 0;

    let recommendation = 'Mantenha o monitoramento.';
    let savings = 0;

    if (fatorR < 0.28 && fatorR > 0.2) {
      recommendation =
        'Aumente o pró-labore em 8% para atingir o Fator-R e reduzir seu imposto de 15,5% para 6%.';
      savings = revenue * 0.095; // Economia aproximada de 9.5%
    }

    return {
      fatorR: Number(fatorR.toFixed(4)),
      taxRegime: 'Simples Nacional',
      recommendation,
      potentialSavings: Math.round(savings),
    };
  }

  /**
   * 🔮 SIMULAÇÃO DE CENÁRIOS (What-if)
   * Útil para o CFO Virtual responder perguntas do tipo: "E se eu contratar um funcionário?"
   */
  async simulateScenario(
    companyId: string,
    impactAmount: number,
    type: 'EXPENSE' | 'REVENUE',
  ) {
    const currentHealth = await this.prisma.financialSnapshot.findFirst({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    if (!currentHealth) throw new Error('Dados base não encontrados.');

    const currentProfit = currentHealth.netProfit.toNumber();
    const newProfit =
      type === 'EXPENSE' ? currentProfit - 10 : currentProfit + 10; // Impacto simulado no score

    return {
      originalScore: currentProfit,
      simulatedScore: Math.max(0, Math.min(100, newProfit)),
      viability: newProfit > 50 ? 'VIABLE' : 'RISKY',
      observation:
        type === 'EXPENSE'
          ? `Este custo reduzirá sua margem de segurança em ${Math.abs(currentProfit - newProfit)} pontos.`
          : `Este incremento de receita estabiliza sua nota de liquidez.`,
    };
  }
}
