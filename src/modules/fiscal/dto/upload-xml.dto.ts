import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Define os tipos de documentos suportados pelo motor bCost.
 */
export enum XmlDocumentType {
  NFE = 'NFE', // Nota Fiscal Eletrônica (Produtos)
  NFSE = 'NFSE', // Nota Fiscal de Serviço Eletrônica
  CTE = 'CTE', // Conhecimento de Transporte
}

export class UploadXmlDto {
  @ApiProperty({
    description: 'Tipo do documento contido no XML para otimizar o parser.',
    enum: XmlDocumentType,
    example: XmlDocumentType.NFE,
  })
  @IsEnum(XmlDocumentType, {
    message: 'Tipo de documento não suportado pela engine.',
  })
  type: XmlDocumentType;

  @ApiProperty({
    description: 'Observação interna ou categoria do lançamento.',
    required: false,
    example: 'Faturamento Mensal - Projeto X',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
