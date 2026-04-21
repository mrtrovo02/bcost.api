import { IsNumber, IsInt, Min, Max, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePayrollDto {
  @ApiProperty({
    example: 5000.0,
    description: 'Valor bruto do Pró-labore ou Folha',
  })
  @IsNumber()
  @Min(1412) // Salário mínimo 2024 como trava de segurança
  amount: number;

  @ApiProperty({ example: 1, description: 'Mês da competência (1-12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ example: 2026, description: 'Ano da competência' })
  @IsInt()
  @Min(2020)
  year: number;

  @ApiProperty({ example: 'uuid-da-empresa' })
  @IsUUID()
  companyId: string;
}
