import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { register } from 'prom-client';

describe('bCost API - Production Ready E2E Suite (Fastify)', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    // Configurações idênticas ao ambiente produtivo do main.ts
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
      ],
    });

    prismaService = moduleFixture.select(PrismaModule).get(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    // Evita vazamento de memória e conexões abertas no pool do Prisma
    await prismaService.$disconnect();
    await app.close();
  });

  it('🧪 [E2E-001] GET /health - Deve retornar status UP com banco saudável', async () => {
    jest.spyOn(prismaService, 'isHealthy').mockResolvedValue(true);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('UP');
    expect(body.service).toBe('bcost-api');
    expect(body).toHaveProperty('buildVersion');
    expect(body).toHaveProperty('timestamp');
  });

  it('🧪 [E2E-002] GET /health - Deve interceptar e retornar 503 quando o banco falhar', async () => {
    jest
      .spyOn(prismaService, 'isHealthy')
      .mockRejectedValue(new Error('Prisma Connection Timeout'));

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('DOWN');
  });

  it('🧪 [E2E-003] GET /metrics - Deve exportar telemetria nativa do Prometheus', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(register.contentType);
    expect(response.payload).toContain('process_cpu_user_seconds_total');
  });

  it('🧪 [E2E-004] CORS & Rastreabilidade - Deve verificar conformidade do cabeçalho x-bcost-trace-id', async () => {
    const mockTraceId = 'prod-verification-token-9999';

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-bcost-trace-id': mockTraceId,
      },
    });

    expect(response.headers['x-bcost-trace-id']).toBe(mockTraceId);
  });
});
