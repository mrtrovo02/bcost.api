import { ApiProperty } from '@nestjs/swagger';

export class FactorRResponseDto {
  @ApiProperty({ example: 0.2855 })
  value: number;

  @ApiProperty({ example: true })
  isEligibleForAnexoIII: boolean;

  @ApiProperty({ example: 150000.00 })
  revenueLast12Months: number;

  @ApiProperty({ example: 42750.00 })
  payrollLast12Months: number;

  @ApiProperty({ example: 'Cálculo baseado nos últimos 12 meses fechados.' })
  analysis: string;
}
