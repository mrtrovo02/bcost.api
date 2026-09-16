'use strict';

import { Prisma, TransactionType } from '@prisma/client';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto.js';

/**
 * Builder de filtros para Conciliação Bancária
 * bCost API — Query Engine
 *
 * Responsável por:
 * - Converter DTO → Prisma WhereInput
 * - Garantir multi-tenant isolado (Segurança)
 * - Interpretar lógica de Range de Datas e Campos Virtuais
 */
export class ReconciliationWhereBuilder {
  /**
   * BUILD PRINCIPAL (LISTAGENS / DASHBOARDS)
   * Transforma o DTO de filtros em uma query válida para o Prisma.
   */
  static build(
    query: ReconciliationQueryDto,
  ): Prisma.BankTransactionWhereInput {
    const and: Prisma.BankTransactionWhereInput[] = [];

    /**
     * 🔐 Segurança Multi-tenant (Obrigatório)
     */
    and.push({
      companyId: query.companyId,
    });

    /**
     * Filtro por Tipo (CREDIT / DEBIT)
     */
    if (query.type) {
      and.push({ type: query.type });
    }

    /**
     * Filtro de Status de Conciliação
     */
    if (typeof query.reconciled === 'boolean') {
      and.push({ reconciled: query.reconciled });
    }

    /**
     * 📅 Filtro de Período (Range de Datas)
     * Implementado com gte (>=) e lte (<=)
     */
    if (query.startDate || query.endDate) {
      and.push({
        occurredAt: {
          ...(query.startDate && { gte: query.startDate }),
          ...(query.endDate && { lte: query.endDate }),
        },
      });
    }

    /**
     * 🧠 Campo Lógico: hasInvoiceCandidate
     * Filtra transações baseando-se na existência ou não de vínculos.
     */
    if (typeof query.hasInvoiceCandidate === 'boolean') {
      if (query.hasInvoiceCandidate) {
        // Possui algum vínculo (Nota ou Imposto)
        and.push({
          OR: [
            { invoiceId: { not: null } },
            { taxObligationId: { not: null } },
          ],
        });
      } else {
        // Não possui nenhum vínculo (Totalmente pendente)
        and.push({
          AND: [{ invoiceId: null }, { taxObligationId: null }],
        });
      }
    }

    // Retorna o objeto AND consolidado
    return { AND: and };
  }

  /**
   * AUTO MATCH (ROTINAS AUTOMÁTICAS)
   * Filtro específico para o motor de busca automática.
   */
  static autoMatch(companyId: string): Prisma.BankTransactionWhereInput {
    return {
      AND: [
        { companyId },
        { reconciled: false },
        // Geralmente focamos no crédito para conciliação automática de Invoices
        { type: TransactionType.CREDIT },
      ],
    };
  }

  /**
   * FILTRO SEGURO POR ID
   * Garante que um ID só seja encontrado se pertencer à empresa correta.
   */
  static byId(
    companyId: string,
    bankTransactionId: string,
  ): Prisma.BankTransactionWhereInput {
    return {
      AND: [{ id: bankTransactionId }, { companyId }],
    };
  }
}
