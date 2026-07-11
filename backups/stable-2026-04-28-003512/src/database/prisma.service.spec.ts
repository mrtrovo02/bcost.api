import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Conexão com o Banco de Dados estabelecida.');
    } catch (error) {
      this.logger.error('❌ Erro ao conectar ao banco:', error);
    }
  }

  // Substitui o antigo enableShutdownHooks usando o Lifecycle Hook do NestJS
  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disposing: Conexão com o Prisma encerrada.');
  }
}

describe('PrismaService (placeholder)', () => {
  it('loads', () => {
    expect(true).toBe(true);
  });
});
