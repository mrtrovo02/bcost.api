import { Injectable, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma, FiscalSimulationLog } from '@prisma/client';
import { FiscalSimulationRepository } from './fiscal-simulation.repository.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface CalculateSimulationInput {
  companyId?: string;
  monthlyRevenue: number | string | Decimal;
  cbsRate: number | string | Decimal;
  ibsRate: number | string | Decimal;
}

export interface CalculatedSimulationOutput {
  monthlyRevenue: Decimal;
  cbsRate: Decimal;
  ibsRate: Decimal;
  cbsValue: Decimal;
  ibsValue: Decimal;
  totalTransitionalTax: Decimal;
  netRevenue: Decimal;
}

@Injectable()
export class FiscalSimulationService {
  constructor(
    private readonly simulationRepository: FiscalSimulationRepository,
  ) {}

  public calculate(
    input: CalculateSimulationInput,
  ): CalculatedSimulationOutput {
    const monthlyRevenue = new Decimal(input.monthlyRevenue);
    const cbsRate = new Decimal(input.cbsRate);
    const ibsRate = new Decimal(input.ibsRate);

    if (monthlyRevenue.isNegative()) {
      throw new BadRequestException('A receita mensal não pode ser negativa.');
    }

    if (cbsRate.isNegative() || ibsRate.isNegative()) {
      throw new BadRequestException(
        'As alíquotas tributárias não podem ser negativas.',
      );
    }

    const cbsValue = monthlyRevenue.mul(cbsRate).toDecimalPlaces(2);
    const ibsValue = monthlyRevenue.mul(ibsRate).toDecimalPlaces(2);
    const totalTransitionalTax = cbsValue.plus(ibsValue);
    const netRevenue = monthlyRevenue.minus(totalTransitionalTax);

    return {
      monthlyRevenue,
      cbsRate,
      ibsRate,
      cbsValue,
      ibsValue,
      totalTransitionalTax,
      netRevenue,
    };
  }

  public async executeAndSave(
    input: CalculateSimulationInput,
  ): Promise<FiscalSimulationLog> {
    const computed = this.calculate(input);

    return this.simulationRepository.create({
      companyId: input.companyId ?? null,
      monthlyRevenue: new Prisma.Decimal(computed.monthlyRevenue.toFixed(2)),
      cbsRate: new Prisma.Decimal(computed.cbsRate.toFixed(4)),
      ibsRate: new Prisma.Decimal(computed.ibsRate.toFixed(4)),
      cbsValue: new Prisma.Decimal(computed.cbsValue.toFixed(2)),
      ibsValue: new Prisma.Decimal(computed.ibsValue.toFixed(2)),
      totalTransitionalTax: new Prisma.Decimal(
        computed.totalTransitionalTax.toFixed(2),
      ),
      netRevenue: new Prisma.Decimal(computed.netRevenue.toFixed(2)),
    });
  }
}
