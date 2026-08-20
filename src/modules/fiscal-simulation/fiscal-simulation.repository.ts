import { Injectable } from '@nestjs/common';
import { FiscalSimulationLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

export interface CreateFiscalSimulationDTO {
  companyId?: string | null;
  monthlyRevenue: Prisma.Decimal;
  cbsRate: Prisma.Decimal;
  ibsRate: Prisma.Decimal;
  cbsValue: Prisma.Decimal;
  ibsValue: Prisma.Decimal;
  totalTransitionalTax: Prisma.Decimal;
  netRevenue: Prisma.Decimal;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

@Injectable()
export class FiscalSimulationRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async create(
    data: CreateFiscalSimulationDTO,
  ): Promise<FiscalSimulationLog> {
    return this.prisma.fiscalSimulationLog.create({
      data: {
        companyId: data.companyId ?? null,
        monthlyRevenue: data.monthlyRevenue,
        cbsRate: data.cbsRate,
        ibsRate: data.ibsRate,
        cbsValue: data.cbsValue,
        ibsValue: data.ibsValue,
        totalTransitionalTax: data.totalTransitionalTax,
        netRevenue: data.netRevenue,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            cnpj: true,
            taxRegime: true,
          },
        },
      },
    });
  }

  public async findById(id: string): Promise<FiscalSimulationLog | null> {
    return this.prisma.fiscalSimulationLog.findFirst({
      where: { id, deletedAt: null },
      include: { company: true },
    });
  }

  public async findByCompanyId(
    companyId: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResult<FiscalSimulationLog>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.FiscalSimulationLogWhereInput = {
      companyId,
      deletedAt: null,
    };

    const [total, data] = await Promise.all([
      this.prisma.fiscalSimulationLog.count({ where }),
      this.prisma.fiscalSimulationLog.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
