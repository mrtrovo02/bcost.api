'use strict';

import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBusinessRuleEnterpriseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsObject()
  condition!: Record<string, unknown>;

  @IsObject()
  action!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
