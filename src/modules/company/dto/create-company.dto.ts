import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaxRegime } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsCnpj } from '../../../common/validators/cnpj.util.js';

export class CreateCompanyDto {
  @ApiProperty({
    description: 'Nome da empresa',
    example: 'Empresa Exemplo Ltda',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome da empresa é obrigatório.' })
  name: string;

  @ApiProperty({
    description: 'CNPJ da empresa (apenas números, 14 dígitos)',
    example: '12345678000190',
  })
  @IsString()
  @IsNotEmpty({ message: 'O CNPJ é obrigatório.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Length(14, 14, { message: 'O CNPJ deve ter exatamente 14 dígitos.' })
  @Matches(/^\d+$/, { message: 'O CNPJ deve conter apenas números.' })
  @IsCnpj({ message: 'Informe um CNPJ válido.' })
  cnpj: string;

  @ApiProperty({
    description: 'Regime tributário da empresa',
    enum: TaxRegime,
    example: TaxRegime.SIMPLES_NACIONAL,
  })
  @IsEnum(TaxRegime, {
    message:
      'Regime tributário deve ser: SIMPLES_NACIONAL, LUCRO_PRESUMIDO ou LUCRO_REAL',
  })
  @IsOptional()
  taxRegime?: TaxRegime;

  @IsOptional()
  @IsString()
  cnae?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  anexo?: number;
}
