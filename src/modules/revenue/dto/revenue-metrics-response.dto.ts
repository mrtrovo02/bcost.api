'use strict';

import { ApiProperty } from '@nestjs/swagger';

class FiscalIntelligenceDto {
  @ApiProperty({
    example: 0.28,
    description: 'Valor calculado do Fator R (Massa Salarial / Receita Bruta)',
  })
  factorR: number;

  @ApiProperty({
    example: true,
    description:
      'Indica se a empresa está apta ao Anexo III do Simples Nacional',
  })
  isEligibleAnexoIII: boolean;

  @ApiProperty({
    example: 'Manter Pro-labore acima de R$ 5.000,00',
    description: 'Sugestão automática da Engine Fiscal',
  })
  suggestion: string;
}

export class RevenueMetricsResponseDto {
  @ApiProperty({ example: '02/2026', description: 'Período de referência' })
  period: string;

  @ApiProperty({
    example: 150500.75,
    description: 'Total faturado no período (somente Invoices NORMAL)',
  })
  totalInvoiced: number;

  @ApiProperty({
    example: 42,
    description: 'Quantidade de notas emitidas no período',
  })
  invoiceCount: number;

  @ApiProperty({ type: FiscalIntelligenceDto })
  fiscalIntelligence: FiscalIntelligenceDto;
}
