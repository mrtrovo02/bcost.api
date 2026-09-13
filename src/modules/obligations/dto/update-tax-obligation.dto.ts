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

export class UpdateTaxObligationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'PARTIAL'])
  status?: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'PARTIAL';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fileUrl?: string;
}
