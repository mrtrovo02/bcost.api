'use strict';

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyPlanDto {
  @IsString()
  @IsIn(['FREE', 'PRO', 'ENTERPRISE'])
  planLevel!: 'FREE' | 'PRO' | 'ENTERPRISE';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
