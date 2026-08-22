'use strict';

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SimulateTaxScenarioDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsIn([
    'SERVICE_PROVIDER',
    'HEALTHCARE',
    'LEGAL',
    'TECHNOLOGY',
    'CREATOR',
    'CONSULTING',
    'OTHER',
  ])
  activity:
    | 'SERVICE_PROVIDER'
    | 'HEALTHCARE'
    | 'LEGAL'
    | 'TECHNOLOGY'
    | 'CREATOR'
    | 'CONSULTING'
    | 'OTHER';

  @IsNumber()
  @Min(0)
  monthlyRevenue: number;

  @IsNumber()
  @Min(0)
  monthlyDeductibleExpenses: number;

  @IsNumber()
  @Min(0)
  monthlyPayroll: number;

  @IsInt()
  @Min(0)
  @Max(20)
  dependents: number;

  @IsOptional()
  @IsIn(['PF', 'MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO'])
  currentModel?: 'PF' | 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO';

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  municipalityCode?: string;

  @IsOptional()
  @IsBoolean()
  hasCrcReview?: boolean;
}
