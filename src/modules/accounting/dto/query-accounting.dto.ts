'use strict';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AccountType, EntryOrigin } from '@prisma/client';

export class QueryAccountingDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ALL', ...Object.values(AccountType)])
  type?: AccountType | 'ALL';

  @IsOptional()
  @IsIn(['ALL', ...Object.values(EntryOrigin)])
  origin?: EntryOrigin | 'ALL';

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
