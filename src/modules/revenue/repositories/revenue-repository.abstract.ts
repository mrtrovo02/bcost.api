'use strict';

import { Prisma } from '@prisma/client';

/**
 * RevenueRepository: Abstração para operações de dados de receita e folha.
 * O uso de Decimal do Prisma garante precisão financeira (arbitrary-precision).
 */
export abstract class RevenueRepository {
  abstract getLast12MonthsRevenue(
    companyId: string,
    referenceDate: Date,
  ): Promise<Prisma.Decimal>;
  abstract getLast12MonthsPayroll(
    companyId: string,
    referenceDate: Date,
  ): Promise<Prisma.Decimal>;
}
