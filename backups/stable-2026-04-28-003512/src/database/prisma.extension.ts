'use strict';

import { PrismaClient } from '@prisma/client';
import { contextStorage } from '../common/context/context.storage.js';

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

          // Forçamos o cast para garantir que possamos manipular 'where' sem erros de compilação
          const currentArgs = args as any;

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
            return (client as any)[model].update({
              where: currentArgs.where,
              data: { deletedAt: new Date() },
            });
          }

          if (operation === 'deleteMany') {
            return (client as any)[model].updateMany({
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
