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
  IsObject,
} from 'class-validator';
import * as PrismaClientPkg from '@prisma/client';

// Enums de fallback para evitar que a avaliação dos decoradores lance TypeError
// caso o Prisma Client apresente undefined no carregamento de módulos ES/SWC.
export enum FallbackInvoiceType {
  INPUT = 'INPUT',
  OUTPUT = 'OUTPUT',
  SERVICE = 'SERVICE',
}

export enum FallbackInvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
  ERROR = 'ERROR',
}

export enum FallbackNFeStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

// Resolução segura de objetos de enum em runtime
type EnumLike = Record<string, string | number>;

function getRuntimeEnum(
  source: unknown,
  key: string,
  fallback: EnumLike,
): EnumLike {
  if (source && typeof source === 'object' && key in source) {
    const value = (source as Record<string, unknown>)[key];

    if (value && typeof value === 'object') {
      return value as EnumLike;
    }
  }

  return fallback;
}

const SafeInvoiceType = getRuntimeEnum(
  PrismaClientPkg,
  'InvoiceType',
  FallbackInvoiceType,
);
const SafeInvoiceStatus = getRuntimeEnum(
  PrismaClientPkg,
  'InvoiceStatus',
  FallbackInvoiceStatus,
);
const SafeNFeStatus = getRuntimeEnum(
  PrismaClientPkg,
  'NFeStatus',
  FallbackNFeStatus,
);

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
  @IsObject()
  taxReformPayload?: Record<string, unknown>;

  @IsEnum(SafeInvoiceType)
  type: PrismaClientPkg.InvoiceType;

  @IsOptional()
  @IsEnum(SafeInvoiceStatus)
  status?: PrismaClientPkg.InvoiceStatus;

  @IsOptional()
  @IsEnum(SafeNFeStatus)
  nfeStatus?: PrismaClientPkg.NFeStatus;

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

  @IsOptional()
  @IsString()
  customerDocument?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsObject()
  rawJson?: Record<string, unknown>;
}
