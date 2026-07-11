'use strict';

import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDigitalCertificateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  thumbprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serialNumber?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'EXPIRED', 'REVOKED'])
  status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}
