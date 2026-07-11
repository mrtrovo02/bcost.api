'use strict';

import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAccountingEntryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  debitCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  creditCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['MANUAL', 'INVOICE_AUTO', 'PAYROLL_AUTO', 'BANK_IMPORT', 'TAX_PAYMENT'])
  origin?: 'MANUAL' | 'INVOICE_AUTO' | 'PAYROLL_AUTO' | 'BANK_IMPORT' | 'TAX_PAYMENT';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string;
}
