'use strict';

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsObject,
} from 'class-validator';

export class CreateAuditLogDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  module?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  action!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  entity!: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
