import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateDigitalCertificateDto } from './create-digital-certificate.dto';

/**
 * O PartialType torna todos os campos do CreateDigitalCertificateDto opcionais.
 * Isso é ideal para operações de PATCH onde apenas alguns campos são enviados.
 */
export class UpdateDigitalCertificateDto extends PartialType(
  CreateDigitalCertificateDto,
) {
  // O NestJS herda automaticamente os decorators de validação (IsString, IsUUID, etc)
  // do CreateDigitalCertificateDto, mas agora tratando-os como @IsOptional().
}
