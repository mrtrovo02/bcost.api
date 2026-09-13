'use strict';

import {
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsDate,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';

/**
 * DTO para filtros de conciliação bancária
 * bCost API — Query Contract
 * * Implementa transformação automática de tipos para Query Params.
 */
export class ReconciliationQueryDto {
  /**
   * Empresa (multi-tenant)
   * Obrigatório para isolamento de dados em todas as consultas.
   */
  @ApiProperty({
    description: 'ID da empresa (multi-tenant)',
    format: 'uuid',
    example: 'c1b3f2c4-9a6e-4b8f-9a9d-9b3f8e7c1a11',
  })
  @IsNotEmpty({ message: 'companyId é obrigatório para filtrar os dados' })
  @IsUUID('4', { message: 'companyId deve ser um UUID válido' })
  companyId: string;

  /**
   * Tipo de transação bancária: CREDIT ou DEBIT
   */
  @ApiPropertyOptional({
    enum: TransactionType,
    description: 'Tipo da transação bancária (Entrada ou Saída)',
    example: TransactionType.CREDIT,
  })
  @IsOptional()
  @IsEnum(TransactionType, {
    message: 'type deve ser CREDIT ou DEBIT',
  })
  type?: TransactionType;

  /**
   * Filtro de conciliação
   * Converte a string 'true'/'false' da URL para Boolean real.
   */
  @ApiPropertyOptional({
    description: 'Filtra transações já conciliadas ou ainda pendentes',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'reconciled deve ser um valor booleano' })
  @Type(() => Boolean)
  reconciled?: boolean;

  /**
   * Filtro de data inicial (Inclusivo)
   * Converte string ISO para objeto Date do JS.
   */
  @ApiPropertyOptional({
    description: 'Data inicial para o período de busca (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDate({ message: 'startDate deve ser uma data válida' })
  @Type(() => Date)
  startDate?: Date;

  /**
   * Filtro de data final (Inclusivo)
   */
  @ApiPropertyOptional({
    description: 'Data final para o período de busca (ISO 8601)',
    example: '2026-01-31',
  })
  @IsOptional()
  @IsDate({ message: 'endDate deve ser uma data válida' })
  @Type(() => Date)
  endDate?: Date;

  /**
   * Filtro de candidatos (Scoring Engine)
   */
  @ApiPropertyOptional({
    description:
      'Filtra transações que o motor identificou potenciais notas fiscais',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'hasInvoiceCandidate deve ser um valor booleano' })
  @Type(() => Boolean)
  hasInvoiceCandidate?: boolean;
}
