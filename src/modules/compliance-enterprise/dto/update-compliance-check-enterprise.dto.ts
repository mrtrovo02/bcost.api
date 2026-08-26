'use strict';

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ComplianceStatus, NotificationSeverity } from '@prisma/client';

export class UpdateComplianceCheckEnterpriseDto {
  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @IsEnum(ComplianceStatus)
  status?: ComplianceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
