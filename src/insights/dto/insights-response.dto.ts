'use strict';

import { ApiProperty } from '@nestjs/swagger';

export class AnomalyReportDto {
  @ApiProperty({
    example: 'uuid-da-transacao',
    description: 'ID da transação ou nota fiscal',
  })
  id: string;

  @ApiProperty({
    example: 'Compra de material de escritório acima da média',
    description: 'Descrição da anomalia',
  })
  description: string;

  @ApiProperty({ example: 1500.5, description: 'Valor da transação' })
  amount: number;

  @ApiProperty({
    example: '2026-02-27T10:00:00Z',
    description: 'Data da ocorrência',
  })
  date: Date;

  @ApiProperty({
    example: 2.85,
    description: 'Nível de desvio (Z-Score). Acima de 2.0 é crítico.',
  })
  deviationScore: number;
}

export class FinancialHealthFactorsDto {
  @ApiProperty({ example: 85 })
  liquidity: number;

  @ApiProperty({ example: 90 })
  stability: number;

  @ApiProperty({ example: 75 })
  predictability: number;
}

export class FinancialHealthDto {
  @ApiProperty({ example: 82, description: 'Score geral de 0 a 100' })
  score: number;

  @ApiProperty({ enum: ['HEALTHY', 'WARNING', 'CRITICAL'], example: 'HEALTHY' })
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';

  @ApiProperty({ type: FinancialHealthFactorsDto })
  factors: FinancialHealthFactorsDto;

  @ApiProperty({ example: 'Sua saúde financeira é robusta e previsível.' })
  message: string;
}
