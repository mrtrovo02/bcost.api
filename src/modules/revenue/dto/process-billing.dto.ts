'use strict';

import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class ProcessBillingParamsDto {
  @ApiProperty({
    description: 'ID da empresa para processamento de faturamento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'O ID da empresa deve ser um UUID válido.' })
  @IsNotEmpty({ message: 'O companyId é obrigatório.' })
  companyId: string;
}
