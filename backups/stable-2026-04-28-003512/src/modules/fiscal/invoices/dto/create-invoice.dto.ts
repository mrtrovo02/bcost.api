'use strict';

import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsJSON,
  IsUUID,
} from 'class-validator';
import { InvoiceType } from '@prisma/client';

export class CreateInvoiceDto {
  @IsUUID()
  companyId: string;

  @IsString()
  number: string;

  @IsString()
  accessKey: string;

  @IsDateString()
  issueDate: string;

  @IsNumber()
  totalValue: number;

  @IsNumber()
  taxableValue: number;

  @IsEnum(InvoiceType)
  type: 'PRODUCT' | 'SERVICE';

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
  isAutoCaptured?: boolean; // ADICIONADO PARA COMBINAR COM O SCHEMA

  @IsOptional()
  @IsJSON()
  rawJson?: any;
}
