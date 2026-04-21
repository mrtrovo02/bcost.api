'use strict';

import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetMetricsDto {
  @ApiProperty({ example: 2, description: 'Mês de referência (1-12)' })
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ example: 2026, description: 'Ano de referência' })
  @IsNumber()
  @Min(2000)
  year: number;
}
