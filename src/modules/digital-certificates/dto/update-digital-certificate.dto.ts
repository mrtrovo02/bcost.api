'use strict';

import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CertificateStatus } from '@prisma/client';

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
  @IsEnum(CertificateStatus)
  status?: CertificateStatus;
}
