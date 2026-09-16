import { IsNumber, IsInt, Min, Max, IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para Registro de Folha de Pagamento (Massa Salarial)
 * Essencial para o cálculo do Fator R do bCost Engine.
 */
export class CreatePayrollDto {
  @ApiProperty({
    description: 'Valor total da folha de pagamento (massa salarial)',
    example: 15000.5,
    minimum: 0,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'O valor deve ter no máximo 2 casas decimais' },
  )
  @Min(0, { message: 'O valor da folha não pode ser negativo' })
  @IsNotEmpty({ message: 'O valor (amount) é obrigatório' })
  amount: number;

  @ApiProperty({
    description: 'Mês de competência (1-12)',
    example: 2,
    minimum: 1,
    maximum: 12,
  })
  @IsInt({ message: 'O mês deve ser um número inteiro' })
  @Min(1, { message: 'Mês deve ser maior ou igual a 1' })
  @Max(12, { message: 'O mês deve ser entre 1 e 12' })
  month: number;

  @ApiProperty({
    description: 'Ano de competência (a partir de 2000)',
    example: 2026,
    minimum: 2000,
  })
  @IsInt({ message: 'O ano deve ser um número inteiro' })
  @Min(2000, {
    message: 'O bCost não suporta competências anteriores ao ano 2000',
  })
  year: number;

  @ApiProperty({
    description: 'ID da empresa (UUID v4)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID('4', { message: 'O ID da empresa fornecido não é um UUID v4 válido' })
  @IsNotEmpty({ message: 'O ID da empresa (companyId) é obrigatório' })
  companyId: string;
}
