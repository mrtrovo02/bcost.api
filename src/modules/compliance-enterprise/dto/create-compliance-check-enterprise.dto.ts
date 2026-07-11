'use strict';

import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateComplianceCheckEnterpriseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  checkName!: string;

  @IsOptional()
  @IsString()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'RESOLVED', 'IGNORED', 'IN_PROGRESS'])
  status?: 'OPEN' | 'RESOLVED' | 'IGNORED' | 'IN_PROGRESS';
}
