'use strict';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFiscalObligationDto {
  @IsString()
  @IsIn([
    'DAS',
    'GPS',
    'DARF',
    'SPED_FISCAL',
    'SPED_CONTRIBUICOES',
    'ECD',
    'ECF',
    'DCTF',
    'RAIS',
    'CAGED',
    'DIRF',
    'DEFIS',
    'PGDAS',
  ])
  type!:
    | 'DAS'
    | 'GPS'
    | 'DARF'
    | 'SPED_FISCAL'
    | 'SPED_CONTRIBUICOES'
    | 'ECD'
    | 'ECF'
    | 'DCTF'
    | 'RAIS'
    | 'CAGED'
    | 'DIRF'
    | 'DEFIS'
    | 'PGDAS';

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
  @IsString()
  @IsIn([
    'PENDING',
    'GENERATED',
    'SUBMITTED',
    'ACCEPTED',
    'REJECTED',
    'OVERDUE',
  ])
  status?:
    | 'PENDING'
    | 'GENERATED'
    | 'SUBMITTED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'OVERDUE';

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
