'use strict';

import 'reflect-metadata';
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

async function bootstrap(): Promise<void> {
  const logger = new Logger('bCost-Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  try {
    const adapter = new FastifyAdapter({
      bodyLimit: 52_428_800,
      trustProxy: true,
      requestIdHeader: 'x-bcost-trace-id',
      genReqId: () => randomUUID(),
      keepAliveTimeout: 65_000,
    });

    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      adapter,
      {
        rawBody: true,
        bufferLogs: true,
        logger: isProd
          ? ['error', 'warn', 'log']
          : ['error', 'warn', 'log', 'debug', 'verbose'],
      },
    );

    const config = app.get(ConfigService);
    const PORT = config.get<number>('PORT', 5000);

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
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
    });

    await app.register(fastifyCompress, { global: true });

    const fastifyInstance = app.getHttpAdapter().getInstance();

    fastifyInstance.addHook('onRequest', (request, reply, done) => {
      const rawTraceId = request.headers['x-bcost-trace-id'];

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

      contextStorage.enterWith(store);
      contextStorage.run(store, () => done());
    });

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/(.*)', method: RequestMethod.GET },
      ],
    });

    app.enableCors({
      origin: isProd ? [/bcost\.com\.br$/, /peers\.company$/] : true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-bcost-trace-id'],
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

    const publicBaseUrl =
      config.get<string>('PUBLIC_BASE_URL') || 'https://api.bcost.com.br';

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

      reply.status(dbStatus ? 200 : 503).send({
        status: dbStatus ? 'UP' : 'DOWN',
        timestamp: new Date().toISOString(),
      });
    });

    app.enableShutdownHooks();

    await app.listen(PORT, '0.0.0.0');

    logger.log(`🚀 API local: http://127.0.0.1:${PORT}/api/v1`);
    logger.log(`🚀 API pública: ${publicBaseUrl}/api/v1`);
    logger.log(`📖 Swagger: ${publicBaseUrl}/docs`);
    logger.log(`❤️ Health: ${publicBaseUrl}/health`);
    logger.log(`🧪 Diagnostics: ${publicBaseUrl}/api/v1/diagnostics`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error(`❌ Bootstrap error: ${message}`, stack);
    process.exit(1);
  }
}

bootstrap();
