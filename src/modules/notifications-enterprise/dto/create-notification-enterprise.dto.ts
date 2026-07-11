'use strict';

import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateNotificationEnterpriseDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'TAX_READY',
    'FACTOR_R_ALERT',
    'COMPLIANCE_ISSUE',
    'CERT_EXPIRATION',
    'PAYMENT_OVERDUE',
    'PREDICTIVE_CASHFLOW_ALERT',
    'DAS_OVERDUE',
    'SPED_DUE',
    'ECF_DUE',
    'ECAC_PENDENCY',
    'EMPLOYEE_DISMISSAL_DUE',
  ])
  type?:
    | 'TAX_READY'
    | 'FACTOR_R_ALERT'
    | 'COMPLIANCE_ISSUE'
    | 'CERT_EXPIRATION'
    | 'PAYMENT_OVERDUE'
    | 'PREDICTIVE_CASHFLOW_ALERT'
    | 'DAS_OVERDUE'
    | 'SPED_DUE'
    | 'ECF_DUE'
    | 'ECAC_PENDENCY'
    | 'EMPLOYEE_DISMISSAL_DUE';

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @IsIn(['WEBSOCKET', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'WEBHOOK'])
  channel?: 'WEBSOCKET' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'WEBHOOK';

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'SENT', 'FAILED', 'RETRY', 'READ', 'ARCHIVED'])
  status?: 'PENDING' | 'SENT' | 'FAILED' | 'RETRY' | 'READ' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
