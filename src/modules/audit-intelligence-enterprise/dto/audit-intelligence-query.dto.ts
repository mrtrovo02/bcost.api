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

export class AuditIntelligenceQueryDto {
  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsBooleanString()
  includeSamples?: string;

  @IsOptional()
  @IsBooleanString()
  includeRecommendations?: string;

  @IsOptional()
  @IsBooleanString()
  includeRaw?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  lookback?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
