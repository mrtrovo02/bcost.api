import { ApiProperty } from '@nestjs/swagger';

export class RevenueMetricsResponseDto {
  @ApiProperty({ example: 55000.50 })
  totalRevenue: number;

  @ApiProperty({ example: 12500.00 })
  pendingInvoices: number;

  @ApiProperty({ example: 0.28 })
  currentFactorR: number;

  @ApiProperty({ example: 'ANEXO_III', enum: ['ANEXO_III', 'ANEXO_V'] })
  taxBracket: string;

  @ApiProperty({ example: '2026-04' })
  competence: string;
}
