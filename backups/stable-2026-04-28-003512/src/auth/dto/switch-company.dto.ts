import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchCompanyDto {
  @ApiProperty({
    description: 'ID da empresa para definir como ativa',
    example: 'uuid',
  })
  @IsUUID('4', { message: 'companyId deve ser um UUID válido.' })
  companyId: string;
}
