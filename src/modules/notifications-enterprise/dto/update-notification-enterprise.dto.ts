'use strict';

import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationSeverity, NotificationStatus } from '@prisma/client';

export class UpdateNotificationEnterpriseDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
