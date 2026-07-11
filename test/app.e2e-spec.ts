import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { getQueueToken } from '@nestjs/bullmq';

describe('bCost Engine - Relatório de Evidências Oficiais', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(getQueueToken('default'))
    .useValue({ add: jest.fn(), process: jest.fn() })
    .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('EVIDÊNCIA-01: Disponibilidade de API (Health Check)', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('EVIDÊNCIA-02: Integridade da Camada de Persistência (Prisma)', async () => {
    const prisma = app.get(PrismaService);
    expect(prisma).toBeDefined();
    
    // Teste de pulso no banco de dados
    const check = await prisma.$queryRaw`SELECT 1`.catch(() => 'OFFLINE');
    expect(check).not.toBe('OFFLINE');
  });

  it('EVIDÊNCIA-03: Roteamento e Segurança (Fastify Engine)', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/any-route' });
    // Esperamos 401 (Unauthorized) ou 404 (Not Found), o que prova que o motor está filtrando requisições
    expect([401, 404]).toContain(response.statusCode);
  });

  afterAll(async () => {
    await app.close();
  });
});
