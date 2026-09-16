'use strict';

import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class EvaluateServiceRequestDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(16, { each: true })
  macroServiceIds?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsBoolean()
  activeCustomer?: boolean;

  @IsOptional()
  @IsString()
  contractedAt?: string;

  @IsOptional()
  @IsString()
  eventDate?: string;

  @IsOptional()
  @IsString()
  periodStart?: string;

  @IsOptional()
  @IsBoolean()
  municipalityDigital?: boolean;

  @IsOptional()
  @IsBoolean()
  physicalProtocolRequired?: boolean;
}
