'use strict';

import { Global, Module, Provider } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Injection Token para o cliente Prisma estendido.
 * Permite injetar diretamente o cliente com suporte a Soft-Delete e Multi-Tenancy automático.
 */
export const PRISMA_EXTENDED_CLIENT = Symbol('PRISMA_EXTENDED_CLIENT');

/**
 * Tipo inferido do cliente Prisma estendido para uso em Services e Repositories.
 */
export type PrismaExtendedClient = PrismaService['extended'];

const extendedClientProvider: Provider = {
  provide: PRISMA_EXTENDED_CLIENT,
  useFactory: (prismaService: PrismaService): PrismaExtendedClient => {
    return prismaService.extended;
  },
  inject: [PrismaService],
};

@Global()
@Module({
  providers: [PrismaService, extendedClientProvider],
  exports: [PrismaService, PRISMA_EXTENDED_CLIENT],
})
export class PrismaModule {}
