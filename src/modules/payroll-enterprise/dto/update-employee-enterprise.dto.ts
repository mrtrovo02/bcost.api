'use strict';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
  @IsString()
  @IsIn(['CLT', 'PJ', 'ESTAGIO', 'AUTONOMO', 'SOCIO_ADMINISTRADOR'])
  regime?: string;
}
