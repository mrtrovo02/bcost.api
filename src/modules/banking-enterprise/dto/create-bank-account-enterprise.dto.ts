'use strict';

import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBankAccountEnterpriseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  agency!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  account!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  balanceCache?: number;
}
