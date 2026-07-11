'use strict';

import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'crypto';

import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import {
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, register } from 'prom-client';

import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';

import { AppModule } from './app.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { PrismaService } from './database/prisma.service.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import {
  contextStorage,
  RequestContextStore,
} from './common/context/context.storage.js';
import { ZodValidationPipe } from 'nestjs-zod';
import { redactSensitiveHeaders } from './common/security/redact-headers.util.js';

collectDefaultMetrics();

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

async function listenWithTimeout(
  app: NestFastifyApplication,
  port: number,
  host: string,
  timeoutMs = 30000,
): Promise<void> {
  await Promise.race([
    app.listen(port, host),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Timeout ao iniciar listener HTTP em ${host}:${port} após ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('bCost-Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  try {
    console.log('[BOOT-001] bootstrap iniciado');

    // Inicialização do Fastify com suporte nativo Pino Redact para evitar vazamento de dados sensíveis
    const adapter = new FastifyAdapter({
      bodyLimit: 52_428_800,
      trustProxy: true,
      requestIdHeader: 'x-bcost-trace-id',
      genReqId: () => randomUUID(),
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers.set-cookie',
            'req.headers["set-cookie"]',
            'req.headers["x-api-key"]',
            'req.headers["x-auth-token"]',
            'req.headers["x-access-token"]',
            'req.headers["proxy-authorization"]',
          ],
          censor: '[REDACTED]',
        },
      },
    });

    console.log('[BOOT-002] criando Nest app');

    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      adapter,
      {
        rawBody: true,
        bufferLogs: false,
        logger: isProd
          ? ['error', 'warn', 'log']
          : ['error', 'warn', 'log', 'debug', 'verbose'],
      },
    );

    console.log('[BOOT-003] Nest app criado');

    const config = app.get(ConfigService);
    const PORT = Number(config.get<number>('PORT') ?? process.env.PORT ?? 5000);
    const publicBaseUrl =
      config.get<string>('PUBLIC_BASE_URL') || 'https://api.bcost.com.br';

    await app.register(fastifyHelmet, {
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          baseUri: [`'self'`],
          fontSrc: [`'self'`, 'https:', 'data:'],
          formAction: [`'self'`],
          frameAncestors: [`'self'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          objectSrc: [`'none'`],
          scriptSrc: [`'self'`, 'https:', `'unsafe-inline'`],
          scriptSrcAttr: [`'none'`],
          styleSrc: [`'self'`, 'https:', `'unsafe-inline'`],
        },
      },
    });

    await app.register(fastifyCompress, { global: true });

    const fastifyInstance = app.getHttpAdapter().getInstance();

    // ⚡ Ajuste no ciclo de vida do AsyncLocalStorage para evitar vazamentos de escopo assíncrono
    fastifyInstance.addHook('onRequest', (request, reply, done) => {
      const redactedHeaders = redactSensitiveHeaders(request.headers as Record<string, unknown>);
      const rawTraceId = redactedHeaders['x-bcost-trace-id'];

      const traceId =
        typeof rawTraceId === 'string' && rawTraceId.trim().length > 0
          ? rawTraceId
          : String(request.id || randomUUID());

      request.headers['x-bcost-trace-id'] = traceId;
      reply.header('x-bcost-trace-id', traceId);

      const store: RequestContextStore = {
        requestId: traceId,
        traceId,
        startedAt: Date.now(),
        method: request.method,
        url: request.url,
        userId: null,
        companyId: null,
        role: null,
      };

      contextStorage.run(store, () => {
        done();
      });
    });

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/(.*)', method: RequestMethod.GET },
      ],
    });

    // 🔐 ALINHAMENTO DO CORS: Tratamento das variações léxicas de cabeçalhos de organização requisitados pelo front
    app.enableCors({
      origin: isProd ? [/bcost\.com\.br$/, /peers\.company$/] : true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-bcost-trace-id',
        'x-company-id',
        'companyid',
        'CompanyId'
      ],
      exposedHeaders: [
        'x-bcost-trace-id',
        'x-cache',
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
      ],
    });

    const prismaService = app.select(PrismaModule).get(PrismaService);
    const httpAdapterHost = app.get(HttpAdapterHost);

    app.useGlobalFilters(
      new GlobalExceptionFilter(httpAdapterHost, prismaService),
    );

    // Ordem previsível de execução de pipes globais
    app.useGlobalPipes(
      new ZodValidationPipe(),
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
        errorHttpStatusCode: 422,
      }),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('bCost API')
      .setDescription('Core Engine para Gestão de Custos e Consultoria Digital')
      .setVersion('1.0.0')
      .addServer(publicBaseUrl, 'Servidor Produção')
      .addServer(`http://127.0.0.1:${PORT}`, 'Servidor Local')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'bCost API Documentation',
    });

    fastifyInstance.get('/health', async (_request, reply) => {
      const dbStatus = await prismaService.isHealthy().catch(() => false);

      return reply.status(dbStatus ? 200 : 503).send({
        status: dbStatus ? 'UP' : 'DOWN',
        timestamp: new Date().toISOString(),
      });
    });

    fastifyInstance.get('/metrics', async (_request, reply) => {
      reply.header('Content-Type', register.contentType);
      return reply.send(await register.metrics());
    });

    app.enableShutdownHooks();

    console.log(`[BOOT-004] inicializando Nest`);
    await app.init();

    console.log(`[BOOT-005] iniciando listener em 0.0.0.0:${PORT}`);
    await listenWithTimeout(app, PORT, '0.0.0.0', 30000);

    console.log('[BOOT-006] listener iniciado');

    logger.log(`🚀 API local: http://127.0.0.1:${PORT}/api/v1`);
    logger.log(`🚀 API pública: ${publicBaseUrl}/api/v1`);
    logger.log(`📖 Swagger: ${publicBaseUrl}/docs`);
    logger.log(`❤️ Health: ${publicBaseUrl}/health`);
    logger.log(`📊 Metrics: ${publicBaseUrl}/metrics`);
    logger.log(`🧪 Diagnostics: ${publicBaseUrl}/api/v1/diagnostics`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error('❌ Bootstrap error:', message);
    if (stack) console.error(stack);

    process.exit(1);
  }
}

void bootstrap();
