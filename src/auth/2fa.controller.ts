'use strict';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { TwoFAService } from './2fa.service.js';
import { DisableTwoFADto, VerifyTwoFADto } from './dto/verify-2fa.dto.js';
import { ThrottleEndpoint } from '../common/decorators/throttle-endpoint.decorator.js';

interface AuthenticatedUser {
  id: string;
}

@ApiTags('Auth 2FA')
@ApiBearerAuth()
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
export class TwoFAController {
  constructor(private readonly twoFAService: TwoFAService) {}

  @Get('setup')
  @ApiOperation({
    summary: 'Gerar configuração TOTP para o usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Secret, QR code e backup codes gerados.',
  })
  async generateSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFAService.generateTwoFASecret(user.id);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ThrottleEndpoint({ limit: 5, ttl: 60 })
  @ApiOperation({ summary: 'Confirmar e ativar 2FA usando código TOTP' })
  @ApiResponse({ status: 200, description: '2FA ativado com sucesso.' })
  @ApiResponse({ status: 401, description: 'Código TOTP inválido.' })
  async confirmTwoFA(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyTwoFADto,
  ) {
    const success = await this.twoFAService.confirmTwoFA(user.id, dto.otpCode);

    if (!success) {
      throw new UnauthorizedException({
        message: 'Código TOTP inválido ou configuração 2FA não pendente.',
        code: 'AUTH-2FA-CONFIRM-FAILED',
      });
    }

    return { message: '2FA activated' };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ThrottleEndpoint({ limit: 5, ttl: 60 })
  @ApiOperation({ summary: 'Desativar 2FA usando TOTP ou backup code válido' })
  @ApiResponse({ status: 200, description: '2FA desativado com sucesso.' })
  @ApiResponse({ status: 401, description: 'Código 2FA inválido.' })
  async disableTwoFA(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTwoFADto,
  ) {
    const success = await this.twoFAService.disableTwoFA(user.id, dto.code);

    if (!success) {
      throw new UnauthorizedException({
        message: 'Código 2FA inválido.',
        code: 'AUTH-2FA-DISABLE-FAILED',
      });
    }

    return { message: '2FA disabled' };
  }
}
