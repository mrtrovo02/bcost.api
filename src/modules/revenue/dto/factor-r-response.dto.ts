'use strict';

import { ApiProperty } from '@nestjs/swagger';

/**
 * FactorRResponseDto: Contrato de saída para análise de enquadramento tributário.
 * Baseado no cálculo de Massa Salarial (Payroll) / Receita Bruta (Invoice).
 */
export class FactorRResponseDto {
  @ApiProperty({
    example: 0.285,
    description: 'Índice do Fator R. Acima de 0.28 (28%) permite Anexo III.',
  })
  factorR: number;

  @ApiProperty({
    example: true,
    description:
      'Indicação direta se a empresa economizará impostos no Anexo III.',
  })
  isEligibleForAnexoIII: boolean;

  @ApiProperty({
    example: 120000.0,
    description: 'Somatório da Receita Bruta dos últimos 12 meses.',
  })
  revenue12: number;

  @ApiProperty({
    example: 34200.0,
    description:
      'Somatório da Folha de Pagamento/Pró-labore dos últimos 12 meses.',
  })
  payroll12: number;

  @ApiProperty({
    example: 'Aumentar Pró-labore em R$ 450,00 para atingir o Fator R.',
    description: 'Insight gerado pela Engine Fiscal.',
  })
  suggestion: string;
}
