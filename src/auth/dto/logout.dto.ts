import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'Token JWT a revogar. Se omitido, a API revoga o Bearer token enviado no header Authorization.',
  })
  @IsOptional()
  @IsString()
  token?: string;
}
