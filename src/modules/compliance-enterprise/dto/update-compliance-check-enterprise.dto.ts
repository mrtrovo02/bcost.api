'use strict';

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateComplianceCheckEnterpriseDto {
  @IsOptional()
  @IsString()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'RESOLVED', 'IGNORED', 'IN_PROGRESS'])
  status?: 'OPEN' | 'RESOLVED' | 'IGNORED' | 'IN_PROGRESS';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
