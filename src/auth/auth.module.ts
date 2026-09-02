'use strict';

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { TwoFAController } from './2fa.controller.js';
import { TwoFAService } from './2fa.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { PrismaModule } from '../database/prisma.module.js';

const DEFAULT_JWT_EXPIRES_IN: StringValue = '1d';

function resolveJwtExpiresIn(configService: ConfigService): StringValue {
  const value = configService.get<string>('JWT_EXPIRES_IN')?.trim();

  if (!value) {
    return DEFAULT_JWT_EXPIRES_IN;
  }

  const validPattern = /^(\d+)(ms|s|m|h|d|w|y)$/;

  if (!validPattern.test(value)) {
    throw new Error(
      `[AuthModule] JWT_EXPIRES_IN inválido: "${value}". Use formatos como 15m, 1h, 1d, 7d.`,
    );
  }

  return value as StringValue;
}

/**
 * AuthModule
 *
 * Núcleo de autenticação bCost:
 * - JWT HS256
 * - Passport JWT strategy
 * - WebSocket JWT guard
 * - Configuração assíncrona via ConfigService
 * - Validação explícita de JWT_SECRET e JWT_EXPIRES_IN
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET')?.trim();

        if (!secret) {
          throw new Error(
            '[AuthModule] Erro crítico: JWT_SECRET não definido.',
          );
        }

        if (secret.length < 32) {
          throw new Error(
            '[AuthModule] Erro crítico: JWT_SECRET deve ter pelo menos 32 caracteres.',
          );
        }

        const expiresIn = resolveJwtExpiresIn(configService);

        return {
          secret,
          signOptions: {
            expiresIn,
            algorithm: 'HS256',
          },
        };
      },
    }),
  ],
  providers: [AuthService, TwoFAService, JwtStrategy, WsJwtGuard],
  controllers: [AuthController, TwoFAController],
  exports: [
    AuthService,
    TwoFAService,
    WsJwtGuard,
    JwtModule,
    PassportModule,
    JwtStrategy,
  ],
})
export class AuthModule {}
