'use strict';

import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ComplianceEnterpriseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'RESOLVED', 'IGNORED', 'IN_PROGRESS'])
  status?: 'OPEN' | 'RESOLVED' | 'IGNORED' | 'IN_PROGRESS';

  @IsOptional()
  @IsBooleanString()
  resolved?: string;

  @IsOptional()
  @IsBooleanString()
  enabled?: string;

  @IsOptional()
  @IsString()
  source?: string;

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
