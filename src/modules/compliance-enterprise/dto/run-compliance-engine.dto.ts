'use strict';

import { IsBoolean, IsOptional } from 'class-validator';

export class RunComplianceEngineDto {
  @IsOptional()
  @IsBoolean()
  createChecks?: boolean;

  @IsOptional()
  @IsBoolean()
  includeResolved?: boolean;

  @IsOptional()
  @IsBoolean()
  resolveStaleEngineChecks?: boolean;
}
