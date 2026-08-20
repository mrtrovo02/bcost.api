'use strict';

import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class RegisterTaxEvidenceDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  fileUrl!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  receiptCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
