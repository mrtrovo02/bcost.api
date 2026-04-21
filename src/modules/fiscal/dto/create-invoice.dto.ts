'use strict';

import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { InvoiceType, InvoiceStatus } from '@prisma/client';

export class CreateInvoiceDto {
  @ApiProperty({
    description: 'ID da unidade de negócio (Company)',
    example: 'uuid-da-empresa',
  })
  @IsUUID()
  companyId: string;

  @ApiProperty({
    description: 'Valor total bruto da nota (Mapeia para amount no Banco)',
    example: 1000.5,
  })
  @IsNumber()
  amount: number; // FIX: Nome alinhado ao Schema 2026

  @ApiProperty({
    description: 'Data de emissão (Mapeia para issuedAt no Banco)',
    example: '2026-01-31T15:00:00Z',
  })
  @IsDateString()
  issuedAt: string | Date; // FIX: Nome alinhado ao Schema 2026

  @ApiProperty({
    enum: InvoiceType,
    description: 'Tipo do documento (PRODUCT ou SERVICE)',
    example: 'SERVICE',
  })
  @IsEnum(InvoiceType)
  type: InvoiceType;

  @ApiProperty({
    enum: InvoiceStatus,
    description: 'Status atual da nota',
    example: 'NORMAL',
    required: false,
  })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  // --- DADOS DO CLIENTE (Obrigatórios para o Motor bCost) ---

  @ApiProperty({
    description: 'CNPJ ou CPF do Cliente/Tomador',
    example: '12345678000190',
  })
  @IsString()
  customerDocument: string;

  @ApiProperty({
    description: 'Razão Social ou Nome do Cliente',
    example: 'Empresa Cliente LTDA',
  })
  @IsString()
  customerName: string;

  // --- METADADOS E CAMPOS OPCIONAIS ---

  @ApiProperty({
    description: 'Número sequencial',
    example: '123456',
    required: false,
  })
  @IsString()
  @IsOptional()
  number?: string;

  @ApiProperty({
    description: 'Chave de acesso',
    example: '352301...',
    required: false,
  })
  @IsString()
  @IsOptional()
  accessKey?: string;

  @IsOptional()
  metadata?: any; // Para armazenar retenções e rawJson sem quebrar o Schema principal
}
