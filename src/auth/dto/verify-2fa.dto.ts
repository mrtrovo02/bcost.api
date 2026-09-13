import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFADto {
  @ApiProperty({
    description:
      'Código TOTP de 6 dígitos gerado pelo aplicativo autenticador.',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'otpCode must contain exactly 6 numeric digits',
  })
  otpCode: string;
}

export class DisableTwoFADto {
  @ApiProperty({
    description: 'Código TOTP atual ou backup code de recuperação.',
    example: '123456',
  })
  @IsString()
  @Length(6, 32)
  code: string;
}

export class VerifyMfaDto {
  @ApiProperty({
    description: 'Token temporário de sessão MFA emitido após login com senha.',
  })
  @IsString()
  mfaSession: string;

  @ApiProperty({
    description: 'Código TOTP de 6 dígitos ou backup code válido.',
    example: '123456',
  })
  @IsString()
  @Length(6, 32)
  otpCode: string;
}
