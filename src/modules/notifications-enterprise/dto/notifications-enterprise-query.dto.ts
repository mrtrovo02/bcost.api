'use strict';

import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  NotificationChannel,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';

export class NotificationsEnterpriseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @IsOptional()
  @IsBooleanString()
  read?: string;

  @IsOptional()
  @IsBooleanString()
  acknowledged?: string;

  @IsOptional()
  @IsBooleanString()
  active?: string;

  @IsOptional()
  @IsString()
  event?: string;

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
