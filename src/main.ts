'use strict';

import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'node:http';

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
import type { FastifyRequest, FastifyReply } from 'fastify';

import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';

import { AppModule } from './app.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { PrismaService } from './database/prisma.service.js';
import { HealthService } from './modules/health/health.service.js';
import { assertMetricsAccess } from './modules/health/metrics-access.util.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import {
  resolveCorsOriginsFromConfig,
  shouldEnableSwagger,
} from './common/config/http-runtime.config.js';
import { BCOST_ALLOWED_CORS_HEADERS } from './common/config/cors-headers.config.js';
import {
  contextStorage,
  RequestContextStore,
} from './common/context/context.storage.js';
import { ZodValidationPipe } from 'nestjs-zod';
import { redactSensitiveHeaders } from './common/security/redact-headers.util.js';
import { TenantContext } from './common/tenant/tenant.context.js';
import {
  LOGGER_REDACTION_CENSOR,
  LOGGER_REDACTION_PATHS,
} from './common/logger/logger-redaction.config.js';

// Previne duplicação de métricas em ambientes com hot-reload ou execuções repetidas
register.clear();
collectDefaultMetrics();

/**
 * Interface auxiliar para garantir tipagem em cabeçalhos sanitizados
 */
interface ExtendedHeaders {
  'x-bcost-trace-id'?: string;
  'x-api-key'?: string;
  [key: string]: unknown;
}

/**
 * Inicia o listener HTTP com timeout e tentativas progressivas em caso de porta ocupada (EADDRINUSE)
 */
async function listenWithTimeout(
  app: NestFastifyApplication,
  port: number,
  host: string,
  maxRetries = 3,
  timeoutMs = 30000,
): Promise<number> {
  let currentPort = port;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      await Promise.race([
        app.listen({ port: currentPort, host }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timeout ao iniciar listener HTTP em ${host}:${currentPort} após ${timeoutMs}ms`,
                ),
              ),
            timeoutMs,
          ),
        ),
      ]);
      return currentPort;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('EADDRINUSE') && retries < maxRetries) {
        retries++;
        const fallbackPort = port + retries;
        console.warn(
          `⚠️ Porta ${currentPort} ocupada. Tentativa ${retries}/${maxRetries} na porta ${fallbackPort}...`,
        );
        currentPort = fallbackPort;
      } else {
        throw error;
      }
    }
  }
  throw new Error(
    `Não foi possível alocar uma porta HTTP após ${maxRetries} tentativas.`,
  );
}

/**
 * Gerencia o encerramento gracioso (Graceful Shutdown) para contêineres Docker, Kubernetes e PM2
 */
function setupGracefulShutdown(
  app: NestFastifyApplication,
  prismaService: PrismaService,
  logger: Logger,
): void {
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.warn(
      `🛑 Sinal ${signal} recebido. Iniciando encerramento gracioso (Graceful Shutdown)...`,
    );

    // Timeout de segurança para forçar o fechamento se o processo travar
    const forceExitTimeout = setTimeout(() => {
      logger.error(
        '💥 Encerramento gracioso excedeu o tempo limite (15s). Forçando exit process(1).',
      );
      process.exit(1);
    }, 15000);

    try {
      // 1. Interrompe a recepção de novas requisições e fecha o servidor Fastify
      await app.close();
      logger.log('✅ Servidor HTTP/Fastify encerrado com sucesso.');

      // 2. Desconecta do banco de dados Prisma de forma limpa
      if (prismaService && typeof prismaService.$disconnect === 'function') {
        await prismaService.$disconnect();
        logger.log('✅ Conexões do banco de dados (Prisma) fechadas.');
      }

      clearTimeout(forceExitTimeout);
      logger.log('👋 Aplicação finalizada de forma segura.');
      process.exit(0);
    } catch (error) {
      logger.error(
        '❌ Erro inesperado durante o encerramento gracioso:',
        error,
      );
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('SIGINT', () => void handleShutdown('SIGINT'));
}

// Handlers globais de exceções não tratadas do Node.js
process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ Unhandled Rejection crítico:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception crítica:', error);
  process.exit(1);
});

/**
 * Função principal de boot da API bCost
 */
export async function bootstrap(): Promise<NestFastifyApplication> {
  const logger = new Logger('bCost-Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  try {
    logger.log('[BOOT-001] Bootstrap iniciado');

    // Configuração do FastifyAdapter com Pino Logger e Redação de Dados Sensíveis
    const adapter = new FastifyAdapter({
      bodyLimit: 52_428_800, // 50MB
      trustProxy: true,
      disableRequestLogging: true,
      requestIdHeader: 'x-bcost-trace-id',
      genReqId: () => randomUUID(),
      // Compatibilidade com proxies (Nginx/ALB) que removem o prefixo `/api`
      // antes de encaminhar para a aplicação. Sem isso, todas as rotas
      // versionadas respondem 404 em produção.
      rewriteUrl: (req: IncomingMessage) => {
        const url = req.url ?? '/';
        if (/^\/v\d+(\/|$)/.test(url)) {
          return `/api${url}`;
        }
        return url;
      },
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        redact: {
          paths: [...LOGGER_REDACTION_PATHS],
          censor: LOGGER_REDACTION_CENSOR,
        },
      },
    });

    logger.log('[BOOT-002] Criando aplicação NestJS');

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

    logger.log('[BOOT-003] Aplicação NestJS criada com sucesso');

    const config = app.get(ConfigService);
    const PORT = Number(config.get<number>('PORT') ?? process.env.PORT ?? 5000);
    const HOST = config.get<string>('HOST') || process.env.HOST || '0.0.0.0';
    const publicBaseUrl =
      config.get<string>('PUBLIC_BASE_URL') || `http://127.0.0.1:${PORT}`;
    const swaggerEnabled = shouldEnableSwagger(
      isProd,
      config.get<string>('ENABLE_SWAGGER'),
    );

    // Registra o Fastify Helmet (Cabeçalhos de Segurança HTTP e CSP)
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

    // Registra Compressão HTTP (Gzip / Brotli)
    await app.register(fastifyCompress, { global: true });

    const fastifyInstance = app.getHttpAdapter().getInstance();

    const rootRouteHandler = (
      _request: FastifyRequest,
      reply: FastifyReply,
    ) =>
      reply.status(200).send({
        service: 'bcost-api',
        status: 'operational',
        version: 'v1',
        endpoints: {
          api: '/api/v1',
          health: '/api/v1/health',
          live: '/api/v1/live',
          ready: '/api/v1/ready',
          diagnostics: '/api/v1/diagnostics',
        },
        timestamp: new Date().toISOString(),
      });

    // Hook de contexto assíncrono para Trace ID e Isolação de Tenant (Multi-Tenancy)
    fastifyInstance.addHook(
      'onRequest',
      (request: FastifyRequest, reply: FastifyReply, done) => {
        const redactedHeaders = redactSensitiveHeaders(
          request.headers as Record<string, unknown>,
        ) as ExtendedHeaders;
        const rawTraceId = redactedHeaders['x-bcost-trace-id'];

        const traceId =
          typeof rawTraceId === 'string' && rawTraceId.trim().length > 0
            ? rawTraceId
            : String(request.id || randomUUID());

        request.headers['x-bcost-trace-id'] = traceId;
        void reply.header('x-bcost-trace-id', traceId);

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
          TenantContext.run({ requestId: traceId }, () => {
            done();
          });
        });
      },
    );

    // Versionamento da API via URI (/v1, /v2, etc.)
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    // Prefixo global com exceções para rotas operacionais / infraestrutura
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'live', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
        { path: 'robots.txt', method: RequestMethod.GET },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/(.*)', method: RequestMethod.GET },
        { path: 'v2/settings', method: RequestMethod.GET },
      ],
    });

    // Configuração de CORS
    app.enableCors({
      origin: resolveCorsOriginsFromConfig(config, isProd),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
      allowedHeaders: [...BCOST_ALLOWED_CORS_HEADERS],
      exposedHeaders: [
        'x-bcost-trace-id',
        'x-cache',
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
      ],
    });

    const prismaService = app.select(PrismaModule).get(PrismaService);
    const healthService = app.get(HealthService);
    const httpAdapterHost = app.get(HttpAdapterHost);

    // Filtros e Pipes Globais
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

    // Documentação Swagger
    if (swaggerEnabled) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('bCost API')
        .setDescription(
          'Core Engine para Gestão de Custos e Consultoria Digital',
        )
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
    }

    // Rotas Nativas do Fastify para Health/Liveness/Readiness/Metrics
    const buildHealthPayload = async () => {
      const dbStatus = await prismaService.isHealthy().catch(() => false);
      return {
        status: dbStatus ? 'UP' : 'DOWN',
        timestamp: new Date().toISOString(),
      };
    };

    const healthRouteHandler = async (
      _request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const payload = await buildHealthPayload();
      const dbStatus = payload.status === 'UP';
      return reply.status(dbStatus ? 200 : 503).send(payload);
    };

    const liveRouteHandler = async (
      _request: FastifyRequest,
      reply: FastifyReply,
    ) =>
      reply.status(200).send({
        status: 'alive',
        service: 'bcost-api',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });

    const readyRouteHandler = async (
      _request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const readiness = await healthService.getReadiness().catch((error) => ({
        status: 'not_ready' as const,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));

      return reply
        .status(readiness.status === 'ready' ? 200 : 503)
        .send(readiness);
    };

    fastifyInstance.get('/', rootRouteHandler);
    fastifyInstance.get('/api', rootRouteHandler);

    fastifyInstance.get('/health', healthRouteHandler);
    fastifyInstance.get('/api/health', healthRouteHandler);
    fastifyInstance.get('/api/v1/health', healthRouteHandler);

    fastifyInstance.get('/live', liveRouteHandler);
    fastifyInstance.get('/api/live', liveRouteHandler);
    fastifyInstance.get('/api/v1/live', liveRouteHandler);

    fastifyInstance.get('/ready', readyRouteHandler);
    fastifyInstance.get('/api/ready', readyRouteHandler);
    fastifyInstance.get('/api/v1/ready', readyRouteHandler);

    fastifyInstance.get('/robots.txt', async (_request, reply) => {
      void reply.header('Content-Type', 'text/plain; charset=utf-8');
      return reply.send(['User-agent: *', 'Disallow: /', ''].join('\n'));
    });

    fastifyInstance.get(
      '/metrics',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const providedApiKey = (request.headers as ExtendedHeaders)[
          'x-api-key'
        ];

        try {
          assertMetricsAccess(config, providedApiKey);
        } catch {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        void reply.header('Content-Type', register.contentType);
        return reply.send(await register.metrics());
      },
    );

    // Ativa os Hooks de shutdown do NestJS
    app.enableShutdownHooks();

    // Ativa o Graceful Shutdown customizado do processo Node.js
    setupGracefulShutdown(app, prismaService, logger);

    logger.log('[BOOT-004] Inicializando aplicação NestJS');
    await app.init();

    const effectivePort = await listenWithTimeout(app, PORT, HOST, 3, 30000);

    logger.log(`[BOOT-005] Servidor ativo em ${HOST}:${effectivePort}`);
    logger.log('[BOOT-006] Listener concluído com sucesso');

    logger.log(`🚀 API local: http://127.0.0.1:${effectivePort}/api/v1`);
    logger.log(`🚀 API pública: ${publicBaseUrl}/api/v1`);
    logger.log(
      swaggerEnabled
        ? `📖 Swagger: ${publicBaseUrl}/docs`
        : '📖 Swagger: desabilitado',
    );
    logger.log(`❤️ Health: ${publicBaseUrl}/health`);
    logger.log(`✅ Readiness: ${publicBaseUrl}/ready`);
    logger.log(`📊 Metrics: ${publicBaseUrl}/metrics`);
    logger.log(`🧪 Diagnostics: ${publicBaseUrl}/api/v1/diagnostics`);

    return app;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error('❌ Bootstrap error:', message);
    if (stack) console.error(stack);

    process.exit(1);
  }
}

// Executa automaticamente apenas se não estiver em ambiente de testes
if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
