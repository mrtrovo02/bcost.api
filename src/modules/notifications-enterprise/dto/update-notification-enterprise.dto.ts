'use strict';

import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
  @IsString()
  @IsIn(['PENDING', 'SENT', 'FAILED', 'RETRY', 'READ', 'ARCHIVED'])
  status?: 'PENDING' | 'SENT' | 'FAILED' | 'RETRY' | 'READ' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

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
