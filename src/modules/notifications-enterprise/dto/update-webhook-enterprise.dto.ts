'use strict';

import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateWebhookEnterpriseDto {
  @IsOptional()
  @IsUrl({
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  @MaxLength(1000)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
