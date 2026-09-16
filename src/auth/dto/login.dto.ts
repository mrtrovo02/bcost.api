import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail do usuário',
    example: 'usuario@exemplo.com',
  })
  @IsEmail({}, { message: 'email must be an email' })
  email: string;

  @ApiProperty({
    description: 'Senha do usuário (mínimo 6 caracteres)',
    example: '123456',
    minLength: 6,
  })
  @IsString({ message: 'password must be a string' })
  @MinLength(6)
  password: string;
}
