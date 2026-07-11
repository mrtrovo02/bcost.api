import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateRevenueSchema = z.object({
  amount: z.number().positive('O valor deve ser positivo'),
  description: z.string().min(3, 'Descrição muito curta'),
  category: z.enum(['SERVICE', 'PRODUCT', 'OTHER']),
  dueDate: z.string().datetime(),
  companyId: z.string().uuid(),
  metadata: z.record(z.any()).optional(),
});

export class CreateRevenueDto extends createZodDto(CreateRevenueSchema) {}
