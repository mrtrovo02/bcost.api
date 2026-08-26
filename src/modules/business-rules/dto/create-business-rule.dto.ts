import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsUUID,
} from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateBusinessRuleDto {
  @ApiProperty({ description: 'Nome da regra' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Descrição opcional', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Condição da regra em JSON' })
  @IsObject()
  condition: Prisma.InputJsonObject;

  @ApiProperty({ description: 'Ação a ser executada em JSON' })
  @IsObject()
  action: Prisma.InputJsonObject;

  @ApiProperty({ description: 'Se a regra está ativa', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ description: 'ID da empresa' })
  @IsUUID()
  companyId: string;
}
