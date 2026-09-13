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

export class CreateDigitalCertificateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  issuer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  thumbprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serialNumber?: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  @IsOptional()
  @IsEnum(CertificateStatus)
  status?: CertificateStatus;
}
