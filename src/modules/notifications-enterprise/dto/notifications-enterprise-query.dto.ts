'use strict';

import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class NotificationsEnterpriseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
  @IsBooleanString()
  read?: string;

  @IsOptional()
  @IsBooleanString()
  acknowledged?: string;

  @IsOptional()
  @IsBooleanString()
  active?: string;

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
