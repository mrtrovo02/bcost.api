'use strict';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsOptional,
  IsBoolean,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';

/**
 * DTO para Conciliação Manual
 * bCost API — Banking & Fiscal Reconciliation
 *
 * Define o contrato de entrada para vínculo manual entre:
 * - Transação bancária (extrato)
 * - Nota fiscal (Invoice)
 * - Obrigação fiscal (TaxObligation)
 *
 * ⚠️ Compatível 100% com o schema Prisma
 */
export class ManualMatchDto {
  /**
   * ID da Empresa (Tenant)
   * Essencial para garantir que a transação pertence ao contexto correto.
   */
  @ApiProperty({
    description:
      'ID da empresa (Tenant) para validação de segurança e isolamento',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    format: 'uuid',
  })
  @IsNotEmpty({ message: 'companyId é obrigatório' })
  @IsUUID('4', { message: 'companyId deve ser um UUID válido' })
  companyId: string;

  /**
   * ID da transação bancária (extrato)
   * BankTransaction.id
   */
  @ApiProperty({
    description: 'ID da transação bancária original (Extrato)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsNotEmpty({ message: 'bankTransactionId é obrigatório' })
  @IsUUID('4', { message: 'bankTransactionId deve ser um UUID válido' })
  bankTransactionId: string;

  /**
   * ID da Nota Fiscal a ser conciliada
   * Invoice.id
   */
  @ApiPropertyOptional({
    description: 'ID da nota fiscal a ser conciliada',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'invoiceId deve ser um UUID válido' })
  invoiceId?: string;

  /**
   * ID da Obrigação Fiscal (ex: DAS, GPS)
   * TaxObligation.id
   */
  @ApiPropertyOptional({
    description: 'ID da obrigação fiscal (ex: DAS, GPS)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'taxObligationId deve ser um UUID válido' })
  taxObligationId?: string;

  /**
   * Flag para forçar conciliação manual
   */
  @ApiPropertyOptional({
    description:
      'Força a conciliação ignorando divergências de valores ou datas',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'force deve ser um valor booleano' })
  force?: boolean;

  /**
   * Validação Lógica Customizada:
   * Garante que pelo menos um alvo (Invoice ou Tax) seja enviado.
   * Se ambos estiverem ausentes, o campo dispara erro de 'não vazio'.
   */
  @ValidateIf((dto: ManualMatchDto) => !dto.invoiceId && !dto.taxObligationId)
  @IsNotEmpty({
    message:
      'Deve ser informado ao menos um alvo: invoiceId ou taxObligationId',
  })
  private readonly _atLeastOneTarget!: never;
}
