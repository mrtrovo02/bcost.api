'use strict';

import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  parentCode?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
