'use strict';

import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateContractDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsString()
  @IsNotEmpty()
  customerDocument?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsInt()
  @Min(1)
  @Max(28)
  @IsOptional()
  billingDay?: number;

  toPrisma(customerId: string): Prisma.ContractUncheckedCreateInput {
    return {
      companyId: this.companyId,
      customerId,
      description: this.description,
      amount: new Prisma.Decimal(this.amount),
      billingDay: this.billingDay ?? 5,
    };
  }
}
