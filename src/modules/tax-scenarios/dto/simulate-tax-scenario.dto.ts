'use strict';

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const UUID_OR_DEMO_COMPANY_ID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|demo-[a-z0-9-]+)$/i;

export class SimulateTaxScenarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_OR_DEMO_COMPANY_ID_PATTERN, {
    message: 'companyId deve ser UUID válido ou identificador demo controlado.',
  })
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
