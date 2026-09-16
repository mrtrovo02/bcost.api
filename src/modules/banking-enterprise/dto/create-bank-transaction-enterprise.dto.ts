'use strict';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBankTransactionEnterpriseDto {
  @IsUUID('4')
  bankAccountId!: string;

  @IsString()
  @IsIn(['CREDIT', 'DEBIT'])
  type!: 'CREDIT' | 'DEBIT';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
