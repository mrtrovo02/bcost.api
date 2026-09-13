'use strict';

import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBusinessRuleEnterpriseDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  action?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
