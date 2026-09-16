import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { contextStorage } from '../context/context.storage.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Counter } from 'prom-client';
import {
  redactDeep,
  redactSensitiveHeaders,
} from '../security/redact-headers.util.js';

type HttpRequestLike = {
  method?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, unknown>;
};

type HttpResponseLike = {
  header?: (name: string, value: string) => void;
  setHeader?: (name: string, value: string) => void;
};

const SCANNER_404_PATTERNS = [
  /(?:^|\/)\.env(?:[./_-][\w.-]+)?(?:$|\?)/i,
  /(?:^|\/)\.git(?:\/|$|\?)/i,
  /(?:^|\/)\.(?:aws|npmrc|htaccess|htpasswd)(?:$|\?)/i,
  /(?:^|\/)(?:config|configuration|settings)\.(?:json|ya?ml|ini|bak|old)(?:$|\?)/i,
  /(?:^|\/)(?:composer|package|yarn|pnpm)-lock\.json(?:$|\?)/i,
  /\.php(?:$|\?)/i,
  /(?:^|\/)wp-/i,
  /(?:^|\/)xmlrpc\.php(?:$|\?)/i,
  /(?:^|\/)(adminfuns|makeasmtp|chosen|simple|shell|vendor|owa)\b/i,
  /^\/\/+/,
] as const;

const LOW_NOISE_PUBLIC_404_PATTERNS = [
  /(?:^|\/)robots\.txt(?:$|\?)/i,
  /(?:^|\/)favicon\.ico(?:$|\?)/i,
] as const;

const BCOST_TRACE_HEADER = 'x-bcost-trace-id';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly http5xxCounter = new Counter({
    name: 'bcost_http_5xx_total',
    help: 'Total de respostas HTTP 5xx emitidas pela API bCost.',
    labelNames: ['method', 'status'] as const,
  });

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<HttpRequestLike>();
    const response = ctx.getResponse<HttpResponseLike>();

    // Recupera o contexto da esteira (AsyncLocalStorage)
    const store = contextStorage.getStore();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal Server Error';

    const requestId = this.resolveTraceId(store?.requestId, request.headers);
    const method = request.method ?? 'UNKNOWN';
    const url = request.url ?? httpAdapter.getRequestUrl(request);
    const isScannerNotFound = this.isScannerNotFound(status, method, url);
    const isLowNoisePublicNotFound = this.isLowNoisePublicNotFound(
      status,
      method,
      url,
    );
    const isExpectedRevokedSession = this.isExpectedRevokedSession(
      status,
      message,
    );

    if (status >= 500 && status < 600) {
      this.http5xxCounter.inc({ method, status: String(status) });
    }

    // 1. Log para Observabilidade
    if (isScannerNotFound) {
      this.logger.warn(
        `[${requestId}] Scanner 404 ignorado para auditoria: ${method} ${url}`,
      );
    } else if (isLowNoisePublicNotFound) {
      this.logger.warn(
        `[${requestId}] 404 publico de baixo ruido ignorado para auditoria: ${method} ${url}`,
      );
    } else if (isExpectedRevokedSession) {
      this.logger.warn(
        `[${requestId}] Sessao revogada detectada: ${method} ${url} - Status: ${status}`,
      );
    } else {
      this.logger.error(
        `[${requestId}] ${method} ${url} - Status: ${status}`,
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(redactDeep(exception)),
      );
    }

    // 2. Persistência no AuditLog (Correção Técnica de Tipagem)
    if (!isScannerNotFound && !isLowNoisePublicNotFound) {
      const payload: Record<string, Prisma.InputJsonValue> = {
        path: url,
        method,
        error: this.serializeMessage(message),
      };

      if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
        payload.stack = exception.stack ?? '';
      }

      await this.prisma.auditLog
        .create({
          data: {
            action: 'EXCEPTION_THROWN',
            module: 'GLOBAL_FILTER',
            entity: 'SYSTEM_ERROR',
            entityId: requestId,
            // Forçamos o tipo para string para satisfazer o contrato,
            // mas o '?? undefined' garante que se não houver, o campo não será enviado.
            userId: (store?.userId ?? undefined) as string,
            companyId: (store?.companyId ?? undefined) as string,
            statusCode: status,
            payload: payload as Prisma.InputJsonObject,
            ipAddress: request.ip,
            userAgent: String(
              redactSensitiveHeaders(request.headers ?? {})['user-agent'] ?? '',
            ),
          },
        })
        .catch((err: unknown) =>
          this.logger.error('CRITICAL: AuditLog Failed', err),
        );
    }

    // 3. Resposta Padronizada (Contrato Enterprise)
    this.setProblemDetailsHeaders(response, requestId);

    const detail = this.extractClientMessage(message);
    const responseBody = {
      type: this.resolveProblemType(status),
      title: this.resolveProblemTitle(status),
      status,
      detail,
      instance: httpAdapter.getRequestUrl(request),
      traceId: requestId,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(request),
      requestId: requestId, // ID de rastreio para o suporte
      message: detail,
    };

    httpAdapter.reply(response, JSON.stringify(responseBody), status);
  }

  private isScannerNotFound(
    status: number,
    method: string,
    url: string,
  ): boolean {
    if (status !== HttpStatus.NOT_FOUND) return false;
    if (!['GET', 'HEAD'].includes(method.toUpperCase())) return false;

    return SCANNER_404_PATTERNS.some((pattern) => pattern.test(url));
  }

  private isLowNoisePublicNotFound(
    status: number,
    method: string,
    url: string,
  ): boolean {
    if (status !== HttpStatus.NOT_FOUND) return false;
    if (!['GET', 'HEAD'].includes(method.toUpperCase())) return false;

    return LOW_NOISE_PUBLIC_404_PATTERNS.some((pattern) => pattern.test(url));
  }

  private isExpectedRevokedSession(status: number, message: unknown): boolean {
    if (status !== HttpStatus.UNAUTHORIZED) return false;

    const detail = this.extractClientMessage(message);
    if (typeof detail === 'string') {
      return this.isRevokedSessionMessage(detail);
    }

    if (Array.isArray(detail)) {
      return detail.some(
        (item) =>
          typeof item === 'string' && this.isRevokedSessionMessage(item),
      );
    }

    return false;
  }

  private isRevokedSessionMessage(message: string): boolean {
    const normalized = message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return normalized.includes('sessao revogada');
  }

  private extractClientMessage(message: unknown): unknown {
    if (
      message &&
      typeof message === 'object' &&
      'message' in message &&
      typeof message.message !== 'undefined'
    ) {
      return message.message;
    }

    return message;
  }

  private resolveProblemType(status: number): string {
    if (status >= 500) return 'https://docs.bcost.com.br/problems/internal-server-error';
    if (status === HttpStatus.BAD_REQUEST) return 'https://docs.bcost.com.br/problems/bad-request';
    if (status === HttpStatus.UNAUTHORIZED) return 'https://docs.bcost.com.br/problems/unauthorized';
    if (status === HttpStatus.FORBIDDEN) return 'https://docs.bcost.com.br/problems/forbidden';
    if (status === HttpStatus.NOT_FOUND) return 'https://docs.bcost.com.br/problems/not-found';
    if (status === HttpStatus.CONFLICT) return 'https://docs.bcost.com.br/problems/conflict';
    if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
      return 'https://docs.bcost.com.br/problems/validation-error';
    }

    return 'https://docs.bcost.com.br/problems/http-error';
  }

  private resolveProblemTitle(status: number): string {
    if (status >= 500) return 'Internal Server Error';
    if (status === HttpStatus.BAD_REQUEST) return 'Bad Request';
    if (status === HttpStatus.UNAUTHORIZED) return 'Unauthorized';
    if (status === HttpStatus.FORBIDDEN) return 'Forbidden';
    if (status === HttpStatus.NOT_FOUND) return 'Not Found';
    if (status === HttpStatus.CONFLICT) return 'Conflict';
    if (status === HttpStatus.UNPROCESSABLE_ENTITY) return 'Validation Error';

    return 'HTTP Error';
  }

  private resolveTraceId(
    contextRequestId: string | undefined,
    headers: Record<string, unknown> | undefined,
  ): string {
    if (contextRequestId) return contextRequestId;

    const rawTraceId = headers?.[BCOST_TRACE_HEADER];
    if (typeof rawTraceId === 'string' && rawTraceId.trim().length > 0) {
      return rawTraceId;
    }

    return randomUUID();
  }

  private setProblemDetailsHeaders(
    response: HttpResponseLike,
    traceId: string,
  ): void {
    if (typeof response.header === 'function') {
      response.header('content-type', 'application/problem+json; charset=utf-8');
      response.header(BCOST_TRACE_HEADER, traceId);
      return;
    }

    if (typeof response.setHeader === 'function') {
      response.setHeader('content-type', 'application/problem+json; charset=utf-8');
      response.setHeader(BCOST_TRACE_HEADER, traceId);
    }
  }

  private serializeMessage(message: unknown): Prisma.InputJsonValue {
    if (
      typeof message === 'string' ||
      typeof message === 'number' ||
      typeof message === 'boolean'
    ) {
      return message;
    }

    if (message === null) {
      return 'null';
    }

    return redactDeep(message) as Prisma.InputJsonValue;
  }
}
