'use strict';

import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DispatchWebhookEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  event!: string;

  @IsOptional()
  @IsString()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
