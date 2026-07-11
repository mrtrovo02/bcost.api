'use strict';

import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateContractDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @IsInt()
  @Min(1)
  @Max(28)
  @IsOptional()
  billingDay?: number;
}
