'use strict';

import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import {
  Logger,
  RequestMethod,
  VersioningType,
  ValidationPipe,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { randomUUID } from 'crypto';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { contextStorage } from './common/context/context.storage.js';
import { PrismaService } from './database/prisma.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { ZodValidationPipe } from 'nestjs-zod';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SERVICE_NAME = 'bCost Engine';
const SERVICE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Diagnóstico global de erros assíncronos não capturados
// Essencial para detectar módulos que travam silenciosamente no bootstrap.
// MANTÉM em produção — erros não tratados devem sempre ser logados e encerrar
// o processo para evitar estado inconsistente.
// ---------------------------------------------------------------------------

const diagnosticLogger = new Logger('bCost-Process');

process.on('unhandledRejection', (reason: unknown) => {
  diagnosticLogger.error(
    '💥 UNHANDLED REJECTION — Promise rejeitada sem .catch():',
  );
  diagnosticLogger.error(
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  );
  // Encerra o processo para evitar estado zumbi — o supervisor (PM2/K8s) reinicia
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  diagnosticLogger.error('💥 UNCAUGHT EXCEPTION — Erro síncrono não tratado:');
  diagnosticLogger.error(err.stack ?? err.message);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  const logger = new Logger('bCost-Bootstrap');

  try {
    // -----------------------------------------------------------------------
    // Etapa 1: Instância Fastify
    // -----------------------------------------------------------------------
    logger.debug('🎬 Etapa 1: Criando instância com Fastify Engine...');

    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({
        bodyLimit: 52_428_800, // 50MB
        trustProxy: true,
        requestIdHeader: 'x-bcost-trace-id',
        genReqId: () => randomUUID(),
      }),
      {
        rawBody: true,
        bufferLogs: true,
        logger:
          process.env.NODE_ENV === 'development'
            ? ['error', 'warn', 'log', 'debug', 'verbose']
            : false,
      },
    );

    logger.debug('✅ Etapa 1 concluída — instância Fastify criada.');

    // -----------------------------------------------------------------------
    // Etapa 2: ConfigService
    // -----------------------------------------------------------------------
    const config = app.get(ConfigService);
    const isProd = config.get<string>('NODE_ENV') === 'production';
    const PORT = config.get<number>('PORT') ?? 5000;

    // -----------------------------------------------------------------------
    // Etapa 3: Plugins Fastify
    // -----------------------------------------------------------------------
    logger.debug('🔒 Etapa 3: Registrando plugins Fastify...');

    await app.register(fastifyHelmet, {
      contentSecurityPolicy: isProd,
      crossOriginEmbedderPolicy: false,
    });

    await app.register(fastifyCompress, {
      global: true,
      encodings: ['gzip', 'deflate'],
      threshold: 1024,
    });

    logger.debug('✅ Etapa 3 concluída — Helmet + Compress registrados.');

    // -----------------------------------------------------------------------
    // Etapa 4: Trace ID e Contexto por Request
    // -----------------------------------------------------------------------
    logger.debug('⚙️ Etapa 4: Configurando Contexto e Trace ID...');

    const fastifyInstance = app.getHttpAdapter().getInstance();

    fastifyInstance.addHook('onRequest', (req, res, done) => {
      const traceId = (req.headers['x-bcost-trace-id'] as string) ?? req.id;

      req.headers['x-bcost-trace-id'] = traceId;
      res.header('x-bcost-trace-id', traceId);

      contextStorage.run({ requestId: traceId }, () => done());
    });

    fastifyInstance.addHook('onResponse', (req, res, done) => {
      const duration = res.elapsedTime.toFixed(2);
      const { method, url } = req;
      const status = res.statusCode;
      const traceId = req.headers['x-bcost-trace-id'];

      if (url !== '/health') {
        logger.log(
          `${method} ${url} → ${status} (${duration}ms) [trace: ${traceId}]`,
        );
      }

      done();
    });

    logger.debug('✅ Etapa 4 concluída — Trace ID e hooks configurados.');

    // -----------------------------------------------------------------------
    // Etapa 5: Lifecycle, Versionamento e Prefixo
    // -----------------------------------------------------------------------
    logger.debug('🔄 Etapa 5: Lifecycle, Versionamento e Prefixo Global...');

    app.enableShutdownHooks();

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs-json', method: RequestMethod.GET },
        { path: 'docs-yaml', method: RequestMethod.GET },
      ],
    });

    logger.debug('✅ Etapa 5 concluída.');

    // -----------------------------------------------------------------------
    // Etapa 6: CORS
    // -----------------------------------------------------------------------
    logger.debug('🛡️ Etapa 6: Política de CORS Enterprise...');

    const allowedOrigins = isProd
      ? config
          .getOrThrow<string>('CORS_ORIGINS')
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o.length > 0)
      : [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:5000',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ];

    app.enableCors({
      origin: allowedOrigins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-bcost-trace-id'],
      exposedHeaders: ['Content-Disposition', 'x-bcost-trace-id'],
    });

    logger.debug('✅ Etapa 6 concluída.');

    // -----------------------------------------------------------------------
    // Etapa 7: Filtros, Interceptors e Pipes
    // -----------------------------------------------------------------------
    logger.debug('🛡️ Etapa 7: Aplicando Filtros, Interceptors e Pipes...');

    const prismaService = app.select(PrismaModule).get(PrismaService);
    const httpAdapterHost = app.get(HttpAdapterHost);

    app.useGlobalFilters(
      new GlobalExceptionFilter(httpAdapterHost, prismaService),
    );

    app.useGlobalInterceptors(new LoggingInterceptor());

    app.useGlobalPipes(
      new ZodValidationPipe(),
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        errorHttpStatusCode: 422,
      }),
    );

    logger.debug('✅ Etapa 7 concluída.');

    // -----------------------------------------------------------------------
    // Etapa 8: Health Check
    // -----------------------------------------------------------------------
    logger.debug('❤️  Etapa 8: Registrando Health Check...');

    fastifyInstance.get('/health', async (_: unknown, res: any) => {
      const dbHealthy = await prismaService.isHealthy();
      const status = dbHealthy ? 'UP' : 'DEGRADED';
      const httpStatus = dbHealthy ? 200 : 503;

      res.status(httpStatus).send({
        status,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        checks: { database: dbHealthy ? 'UP' : 'DOWN' },
      });
    });

    logger.debug('✅ Etapa 8 concluída.');

    // -----------------------------------------------------------------------
    // Etapa 9: Swagger
    // -----------------------------------------------------------------------
    const enableSwagger =
      !isProd || config.get<string>('ENABLE_SWAGGER') === 'true';

    if (enableSwagger) {
      logger.debug('📚 Etapa 9: Swagger OpenAPI 3.0...');

      const swaggerConfig = new DocumentBuilder()
        .setTitle('bCost Engine API')
        .setDescription(
          'Engine de cálculo fiscal e automação contábil - Enterprise Edition.',
        )
        .setVersion(SERVICE_VERSION)
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .addTag('Auth')
        .addTag('Company')
        .addTag('Dashboard')
        .addTag('Fiscal')
        .addTag('Revenue')
        .addTag('Banking')
        .addTag('Insights')
        .addServer(`http://localhost:${PORT}`, 'Ambiente Local')
        .build();

      const document = SwaggerModule.createDocument(app, swaggerConfig);

      SwaggerModule.setup('docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          docExpansion: 'none',
          filter: true,
          tryItOutEnabled: !isProd,
        },
        customSiteTitle: 'bCost Intelligence - API Docs',
        useGlobalPrefix: false,
      });

      logger.debug('✅ Etapa 9 concluída.');
    }

    // -----------------------------------------------------------------------
    // Etapa 10: Listen
    // -----------------------------------------------------------------------
    logger.debug(`📡 Etapa 10: Inicializando listener na porta ${PORT}...`);

    await app.listen(PORT, '0.0.0.0');

    const serverUrl = `http://localhost:${PORT}`;

    logger.log('================================================');
    logger.log(`✅ ${SERVICE_NAME} ${SERVICE_VERSION} inicializado`);
    logger.log(`⚡ Runtime:  Fastify + NestJS`);
    logger.log(`🌍 Env:      ${config.get('NODE_ENV') ?? 'development'}`);
    logger.log(`🚀 API Base: ${serverUrl}/api/v1`);
    if (enableSwagger) logger.log(`📊 Swagger:  ${serverUrl}/docs`);
    logger.log(`❤️  Health:   ${serverUrl}/health`);
    logger.log('================================================');
  } catch (error) {
    const logger = new Logger('bCost-Bootstrap');
    logger.error('❌ Erro fatal no bootstrap da aplicação');
    logger.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

bootstrap();
