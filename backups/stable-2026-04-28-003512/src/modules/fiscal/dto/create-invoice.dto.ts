'use strict';

import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsUUID,
  Length,
} from 'class-validator';
import { InvoiceType, InvoiceStatus, NFeStatus } from '@prisma/client';

export class CreateInvoiceDto {
  @IsUUID()
  companyId: string;

  @IsString()
  number: string;

  @IsString()
  @Length(44, 44)
  accessKey: string;

  @IsDateString()
  issueDate: string;

  @IsNumber()
  totalValue: number;

  @IsNumber()
  taxableValue: number;

  @IsEnum(InvoiceType)
  type: InvoiceType;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(NFeStatus)
  nfeStatus?: NFeStatus;

  @IsOptional()
  @IsNumber()
  issRetained?: number;

  @IsOptional()
  @IsNumber()
  irrfRetained?: number;

  @IsOptional()
  @IsNumber()
  pisRetained?: number;

  @IsOptional()
  @IsNumber()
  cofinsRetained?: number;

  @IsOptional()
  @IsNumber()
  csllRetained?: number;

  @IsOptional()
  @IsBoolean()
  isAutoCaptured?: boolean;

  @IsString()
  @IsOptional()
  customerDocument: string;

  @IsString()
  @IsOptional()
  customerName: string;

  @IsOptional()
  rawJson?: any;
}
