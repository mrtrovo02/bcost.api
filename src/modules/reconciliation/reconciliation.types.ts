'use strict';

import { Prisma } from '@prisma/client';

/**
 * ------------------------------------------------------
 * TRANSACTION INPUT (BANK TRANSACTION)
 * ------------------------------------------------------
 * Dados mínimos necessários para cálculo de similaridade
 */
export interface TransactionScoreInput {
  /**
   * Valor monetário da transação
   */
  amount: Prisma.Decimal | number;

  /**
   * Data da transação
   */
  date: Date;

  /**
   * Histórico / descrição do extrato bancário
   */
  description: string;
}

/**
 * ------------------------------------------------------
 * INVOICE INPUT (NOTA FISCAL)
 * ------------------------------------------------------
 * Dados extraídos da Invoice para comparação
 */
export interface InvoiceScoreInput {
  /**
   * Valor total da nota fiscal
   */
  totalValue: Prisma.Decimal | number;

  /**
   * Data de emissão da NF
   */
  issueDate: Date;

  /**
   * Nome do cliente (opcional)
   */
  customerName?: string | null;

  /**
   * Indica se a nota possui cliente vinculado
   */
  hasCustomer: boolean;
}

/**
 * ------------------------------------------------------
 * INPUT CONSOLIDADO DO ENGINE
 * ------------------------------------------------------
 */
export interface ReconciliationScoreInput {
  transaction: TransactionScoreInput;
  invoice: InvoiceScoreInput;
}

/**
 * ------------------------------------------------------
 * RESULTADO DETALHADO DO SCORING
 * ------------------------------------------------------
 * Útil para:
 * - Logs
 * - Auditoria
 * - Debug
 * - Evolução futura (ML / ajustes finos)
 */
export interface ScoreBreakdown {
  /**
   * Similaridade de valor monetário (0–100)
   */
  amountMatch: number;

  /**
   * Similaridade de data (0–100)
   */
  dateMatch: number;

  /**
   * Similaridade nominal (cliente / descrição)
   */
  nameMatch: number;

  /**
   * Score final ponderado
   */
  finalScore: number;
}
