'use strict';

import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { PrismaModule } from '../database/prisma.module.js';

/**
 * AuthModule: Núcleo de Segurança do Motor bCost.
 * Implementa configuração assíncrona com tipagem estrita para produção.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error(
            '[AuthModule] Erro crítico: JWT_SECRET não definido.',
          );
        }

        // Recuperamos a expiração com um fallback seguro
        const expiresIn =
          (configService.get<string>('JWT_EXPIRES_IN') as StringValue) ?? '1d';

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
  providers: [AuthService, JwtStrategy, WsJwtGuard],
  controllers: [AuthController],
  exports: [AuthService, WsJwtGuard, JwtModule, PassportModule, JwtStrategy],
})
export class AuthModule {}
