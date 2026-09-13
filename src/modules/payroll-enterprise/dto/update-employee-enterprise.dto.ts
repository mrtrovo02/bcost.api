'use strict';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EmployeeRegime } from '@prisma/client';

export class UpdateEmployeeEnterpriseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(11)
  @MaxLength(20)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pis?: string;

  @IsOptional()
  @IsDateString()
  admissionAt?: string;

  @IsOptional()
  @IsDateString()
  dismissalAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  baseSalary?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(EmployeeRegime)
  regime?: EmployeeRegime;
}
