'use strict';

import { IsString, IsUUID, IsDateString } from 'class-validator';

export class CreateDigitalCertificateDto {
  @IsUUID()
  companyId: string;

  @IsString()
  issuer: string;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validTo: string;
}
