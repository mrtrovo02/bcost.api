import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { TaxRegime } from '@prisma/client';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(TaxRegime)
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
