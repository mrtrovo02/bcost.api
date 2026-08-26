'use strict';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FiscalObligationStatus, FiscalObligationType } from '@prisma/client';

export class UpdateFiscalObligationDto {
  @IsOptional()
  @IsEnum(FiscalObligationType)
  type?: FiscalObligationType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  referenceMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  referenceYear?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(FiscalObligationStatus)
  status?: FiscalObligationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileHash?: string;

  @IsOptional()
  @IsDateString()
  submittedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiptCode?: string;
}
