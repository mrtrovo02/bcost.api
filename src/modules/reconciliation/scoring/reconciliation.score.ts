'use strict';

import { Prisma } from '@prisma/client';

/**
 * Contexto completo para cálculo de score de conciliação
 * NÃO depende de Prisma Client (somente do tipo Decimal para precisão)
 */
export type ScoreContext = {
  transaction: {
    amount: Prisma.Decimal | number;
    date: Date;
    description: string;
  };
  invoice: {
    totalValue: Prisma.Decimal | number;
    issueDate: Date;
    customerName?: string | null;
    hasCustomer: boolean;
  };
};

/**
 * Engine de score determinístico para conciliação financeira
 * * Evoluído para suportar:
 * - Algoritmo de Distância de Levenshtein (Fuzzy Matching)
 * - Penalização por discrepância temporal
 */
export class ReconciliationScoreEngine {
  /**
   * Tolerância máxima aceitável de valor (1%)
   */
  private static readonly VALUE_TOLERANCE_PERCENT = new Prisma.Decimal(0.01);

  /**
   * Normaliza textos para comparação segura
   */
  private static normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Converte number → Prisma.Decimal de forma segura
   */
  private static toDecimal(value: Prisma.Decimal | number): Prisma.Decimal {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  }

  /**
   * Algoritmo de Levenshtein para medir similaridade entre strings
   * Retorna um valor de 0 a 1 (1 = Identico)
   */
  private static calculateSimilarity(s1: string, s2: string): number {
    const longer = s1.length < s2.length ? s2 : s1;
    const shorter = s1.length < s2.length ? s1 : s2;

    if (longer.length === 0) return 1.0;

    const editDistance = (function (a, b) {
      const costs: number[] = [];
      for (let i = 0; i <= a.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= b.length; j++) {
          if (i === 0) costs[j] = j;
          else {
            if (j > 0) {
              let newValue = costs[j - 1];
              if (a.charAt(i - 1) !== b.charAt(j - 1)) {
                newValue =
                  Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
              }
              costs[j - 1] = lastValue;
              lastValue = newValue;
            }
          }
        }
        if (i > 0) costs[b.length] = lastValue;
      }
      return costs[b.length];
    })(longer, shorter);

    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calcula score total de afinidade entre uma transação e uma nota fiscal
   * Score máximo atual: 110 (com bônus de similaridade)
   */
  static calculate(ctx: ScoreContext): number {
    let score = 0;

    const transactionAmount = this.toDecimal(ctx.transaction.amount);
    const invoiceAmount = this.toDecimal(ctx.invoice.totalValue);

    // ==================================================
    // 1️⃣ VALOR (Peso principal: 60)
    // ==================================================
    if (transactionAmount.equals(invoiceAmount)) {
      score += 60;
    } else {
      const diff = transactionAmount.sub(invoiceAmount).abs();
      const tolerance = invoiceAmount.mul(
        ReconciliationScoreEngine.VALUE_TOLERANCE_PERCENT,
      );

      if (diff.lte(tolerance)) {
        score += 40;
      }
    }

    // ==================================================
    // 2️⃣ DATA (Janela de compensação: 20)
    // ==================================================
    const diffMs = Math.abs(
      ctx.transaction.date.getTime() - ctx.invoice.issueDate.getTime(),
    );
    const diffDays = diffMs / 86_400_000;

    if (diffDays <= 0.5) {
      // Mesmo dia
      score += 20;
    } else if (diffDays <= 2) {
      score += 10;
    } else if (diffDays > 30) {
      score -= 10; // Multa por data muito distante (Provável erro de competência)
    }

    // ==================================================
    // 3️⃣ DESCRIÇÃO / CLIENTE (Fuzzy Match Avançado: 20)
    // ==================================================
    if (ctx.invoice.customerName && ctx.transaction.description) {
      const description = this.normalizeText(ctx.transaction.description);
      const customer = this.normalizeText(ctx.invoice.customerName);

      const similarity = this.calculateSimilarity(description, customer);

      if (description.includes(customer) || customer.includes(description)) {
        score += 20; // Match direto ou parcial
      } else if (similarity > 0.7) {
        score += 15; // Similaridade alta (Levenshtein)
      } else if (similarity > 0.5) {
        score += 5; // Similaridade média
      }
    }

    // ==================================================
    // 4️⃣ INTEGRIDADE CADASTRAL (Bônus: 10)
    // ==================================================
    if (ctx.invoice.hasCustomer) {
      score += 10;
    }

    return Math.max(0, score); // Garante que o score não seja negativo
  }
}
