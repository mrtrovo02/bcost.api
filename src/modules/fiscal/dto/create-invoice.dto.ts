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
  IsIn,
} from 'class-validator';
import { InvoiceType, InvoiceStatus, NFeStatus } from '@prisma/client';

const NFE_ISSUE_PURPOSES = [
  'NORMAL',
  'COMPLEMENTARY',
  'ADJUSTMENT',
  'RETURN',
  'DEBIT_NOTE',
  'CREDIT_NOTE',
] as const;

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

  @IsOptional()
  @IsString()
  @Length(1, 1)
  finNFe?: string;

  @IsOptional()
  @IsIn(NFE_ISSUE_PURPOSES)
  issuePurpose?: (typeof NFE_ISSUE_PURPOSES)[number];

  @IsOptional()
  @IsString()
  @Length(3, 3)
  cstCode?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  cClassTribCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  destinationStateIbge?: string;

  @IsOptional()
  @IsString()
  @Length(7, 7)
  destinationMunicipalityIbge?: string;

  @IsOptional()
  @IsBoolean()
  hasLegacyTaxes?: boolean;

  @IsOptional()
  taxReformPayload?: unknown;

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
