'use strict';

import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CommandCenterQueryDto {
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsBooleanString()
  includeSamples?: string;

  @IsOptional()
  @IsBooleanString()
  includeAudit?: string;

  @IsOptional()
  @IsBooleanString()
  includeHealth?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
