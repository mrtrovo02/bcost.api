'use strict';

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ManualReconciliationEnterpriseDto {
  @IsUUID('4')
  bankTransactionId!: string;

  @IsString()
  @IsIn(['INVOICE', 'TAX_OBLIGATION'])
  targetType!: 'INVOICE' | 'TAX_OBLIGATION';

  @IsUUID('4')
  targetId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
