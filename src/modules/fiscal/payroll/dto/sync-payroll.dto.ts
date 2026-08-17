'use strict';

import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SyncPayrollDto {
  @ApiProperty({
    description: 'Mês de referência da competência sincronizada.',
    example: 8,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({
    description: 'Ano de referência da competência sincronizada.',
    example: 2026,
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({
    description: 'Valor total da folha informado pelo ERP externo.',
    example: 12500.75,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  amount?: number;

  @ApiProperty({
    description: 'Alias aceito para o valor total da folha.',
    example: 12500.75,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  totalAmount?: number;

  @ApiProperty({
    description: 'Valor da folha CLT informado pelo ERP externo.',
    example: 9500,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  salariesAmount?: number;

  @ApiProperty({
    description: 'Valor de pró-labore informado pelo ERP externo.',
    example: 3000.75,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  proLaboreAmount?: number;

  @ApiProperty({
    description: 'Identificador de origem para rastreabilidade operacional.',
    example: 'DOMINIO',
    required: false,
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    description: 'ID externo da competência no sistema integrado.',
    example: 'folha-2026-08',
    required: false,
  })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
