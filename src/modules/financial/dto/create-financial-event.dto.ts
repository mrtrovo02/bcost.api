'use strict';

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
// Importação do tipo diretamente do namespace do Prisma para garantir compatibilidade
import { FinancialEventType } from '@prisma/client';

/**
 * Schema de validação para eventos financeiros (Ledger).
 * Baseado no Mandamento de Imutabilidade do bCost 2026.
 */
export const CreateFinancialEventSchema = z.object({
  companyId: z.string().uuid({ message: 'ID da empresa inválido' }),
  type: z.nativeEnum(FinancialEventType),
  amount: z.number().positive({ message: 'O valor deve ser positivo' }),
  description: z.string().min(3).max(255),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
  occurredAt: z.date().default(() => new Date()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class CreateFinancialEventDto extends createZodDto(
  CreateFinancialEventSchema,
) {}
