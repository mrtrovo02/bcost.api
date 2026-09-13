'use strict';

import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ComplianceStatus, NotificationSeverity } from '@prisma/client';

export class CreateComplianceCheckEnterpriseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  checkName!: string;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ComplianceStatus)
  status?: ComplianceStatus;
}
