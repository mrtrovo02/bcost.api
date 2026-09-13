'use strict';

import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GeneratePayrollEnterpriseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsBoolean()
  createFinancialEvent?: boolean;

  @IsOptional()
  @IsBoolean()
  createAccountingEntry?: boolean;
}
