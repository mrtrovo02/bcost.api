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

export class CreateFiscalObligationDto {
  @IsEnum(FiscalObligationType)
  type!: FiscalObligationType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  referenceMonth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  referenceYear!: number;

  @IsDateString()
  dueDate!: string;

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
