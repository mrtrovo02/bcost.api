'use strict';

import { IsUUID } from 'class-validator';

/**
 * DTO responsável por validar a importação de extratos OFX.
 * Camada pura de domínio (sem HTTP, sem Prisma).
 */
export class ImportOfxDto {
  @IsUUID('4', { message: 'companyId deve ser um UUID válido' })
  companyId: string;

  @IsUUID('4', { message: 'bankAccountId deve ser um UUID válido' })
  bankAccountId: string;
}
