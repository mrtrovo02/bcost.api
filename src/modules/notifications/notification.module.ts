'use strict';

// =============================================================================
// ARQUIVO: src/modules/notifications/notification.module.ts
// =============================================================================

import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service.js';
import { NotificationGateway } from './notification.gateway.js';
import { NotificationController } from './notification.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { NotificationPrismaService } from './notification-prisma.service.js';

/**
 * NotificationModule — Motor de Alertas Real-time bCost
 *
 * @Global() — expõe NotificationService e NotificationGateway para toda
 * a aplicação sem precisar reimportar.
 *
 * FIX CRÍTICO — BOOTSTRAP TRAVADO:
 * O módulo original importava FiscalModule via forwardRef(), e o FiscalModule
 * importava NotificationModule via forwardRef(). O NotificationService ainda
 * injetava TaxService via forwardRef(). Esse triângulo de dependências circulares
 * com @Global() no meio travava o NestJS indefinidamente no NestFactory.create().
 *
 * SOLUÇÃO: NotificationModule NÃO importa mais FiscalModule.
 * O NotificationService NÃO injeta mais TaxService diretamente.
 * A auditoria automática (runAutoAudit) agora é acionada via EventEmitter2
 * pelo FiscalCronService — inversão de dependência limpa.
 *
 * ARQUITETURA CORRETA:
 * FiscalModule emite eventos → NotificationService escuta → sem import circular
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    // JWT para validação no WebSocket Gateway
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    // FIX: FiscalModule REMOVIDO — quebra o ciclo que travava o bootstrap
    // forwardRef(() => FiscalModule) causava deadlock na inicialização
  ],

  controllers: [NotificationController],

  providers: [
    NotificationService,
    NotificationGateway,
    NotificationPrismaService,
  ],

  exports: [
    NotificationService,
    NotificationGateway,
    NotificationPrismaService,
  ],
})
export class NotificationModule {}
