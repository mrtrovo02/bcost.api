'use strict';

import {
  IsNumber,
  IsInt,
  Min,
  Max,
  IsPositive,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object para registro de folha de pagamento.
 * Define as restrições de integridade para a massa salarial e Fator R.
 */
export class CreatePayrollDto {
  @ApiProperty({
    description: 'Valor bruto total da folha ou pró-labore para a competência.',
    example: 3500.0,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'O valor do montante deve ser um número decimal válido.' },
  )
  @IsPositive({ message: 'O valor da folha deve ser um número positivo.' })
  @Min(1412.0, {
    message:
      'O valor do Pró-labore não pode ser inferior ao salário mínimo vigente (R$ 1.412,00 em 2026).',
  })
  amount: number;

  @ApiProperty({
    description: 'Valor específico de salários (CLT).',
    example: 2000.0,
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  salariesAmount?: number;

  @ApiProperty({
    description: 'Valor específico de Pró-labore (Sócios).',
    example: 1500.0,
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  proLaboreAmount?: number;

  @ApiProperty({
    description: 'Mês de referência da competência (1 a 12).',
    example: 2,
  })
  @IsInt({ message: 'O mês deve ser um número inteiro.' })
  @Min(1, { message: 'Mês inválido. Deve ser entre 1 e 12.' })
  @Max(12, { message: 'Mês inválido. Deve ser entre 1 e 12.' })
  month: number;

  @ApiProperty({
    description: 'Ano de referência da competência.',
    example: 2026,
  })
  @IsInt({ message: 'O ano deve ser um número inteiro.' })
  @Min(2000, { message: 'Ano fora do range permitido para análise histórica.' })
  @Max(2100, { message: 'Ano fora do range permitido para projeções futuras.' })
  year: number;
}
