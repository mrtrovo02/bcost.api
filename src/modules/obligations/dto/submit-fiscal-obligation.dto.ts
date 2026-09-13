'use strict';

import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitFiscalObligationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileHash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiptCode?: string;

  @IsOptional()
  @IsDateString()
  submittedAt?: string;
}
