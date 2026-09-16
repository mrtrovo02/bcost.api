'use strict';

import { PrismaClient } from '@prisma/client';
import { contextStorage } from '../common/context/context.storage.js';

type MutablePrismaArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
};

type SoftDeleteDelegate = {
  update(args: {
    where?: Record<string, unknown>;
    data: { deletedAt: Date };
  }): Promise<unknown>;
  updateMany(args: {
    where?: Record<string, unknown>;
    data: { deletedAt: Date };
  }): Promise<unknown>;
};

type PrismaDelegateRegistry = Record<string, unknown>;

function getSoftDeleteDelegate(
  client: PrismaClient,
  model: string,
): SoftDeleteDelegate | null {
  const registry = client as unknown as PrismaDelegateRegistry;
  const delegate = registry[model];

  if (!delegate || typeof delegate !== 'object') return null;

  const candidate = delegate as Partial<SoftDeleteDelegate>;

  if (
    typeof candidate.update !== 'function' ||
    typeof candidate.updateMany !== 'function'
  ) {
    return null;
  }

  return candidate as SoftDeleteDelegate;
}

/**
 * Prisma Extension Corrigida: Multi-tenancy & Soft-Delete.
 * Tipagem adaptada para evitar erros de propriedade inexistente em operações de escrita.
 */
export const prismaExtension = (client: PrismaClient) => {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const context = contextStorage.getStore();
          const companyId = context?.companyId;

          const currentArgs = args as MutablePrismaArgs;

          // --- LÓGICA DE SOFT-DELETE ---
          // Só aplica onde faz sentido (leituras e contagens)
          const readOperations = [
            'findMany',
            'findFirst',
            'findUnique',
            'findUniqueOrThrow',
            'count',
            'aggregate',
          ];
          if (readOperations.includes(operation)) {
            currentArgs.where = { ...currentArgs.where, deletedAt: null };
          }

          // --- LÓGICA DE MULTI-TENANCY ---
          // Filtro automático por empresa para isolamento total de dados
          const modelsWithCompany = [
            'Invoice',
            'BankTransaction',
            'Customer',
            'Contract',
            'Payroll',
            'TaxObligation',
            'FinancialEvent',
            'NotificationLog',
            'AuditLog',
            'BankAccount',
            'TaxCalculation',
            'ComplianceCheck',
          ];

          if (modelsWithCompany.includes(model) && companyId) {
            // Garante que o where exista antes de injetar o companyId
            currentArgs.where = { ...currentArgs.where, companyId };
          }

          // --- OPERAÇÃO DE DELETE (INTERCEPTOR) ---
          // Transforma exclusão física em Soft-Delete (Update)
          if (operation === 'delete') {
            const delegate = getSoftDeleteDelegate(client, model);

            if (!delegate) {
              return query(currentArgs);
            }

            return delegate.update({
              where: currentArgs.where,
              data: { deletedAt: new Date() },
            });
          }

          if (operation === 'deleteMany') {
            const delegate = getSoftDeleteDelegate(client, model);

            if (!delegate) {
              return query(currentArgs);
            }

            return delegate.updateMany({
              where: currentArgs.where,
              data: { deletedAt: new Date() },
            });
          }

          return query(currentArgs);
        },
      },
    },
  });
};
