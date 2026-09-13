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

export class UpdateAccountPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  parentCode?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
