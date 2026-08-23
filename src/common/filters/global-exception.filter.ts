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
import { contextStorage } from '../context/context.storage.js';
import { PrismaService } from '../../database/prisma.service.js';
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

const SCANNER_404_PATTERNS = [
  /\.php(?:$|\?)/i,
  /(?:^|\/)wp-/i,
  /(?:^|\/)xmlrpc\.php(?:$|\?)/i,
  /(?:^|\/)(adminfuns|makeasmtp|chosen|simple|shell|vendor|owa)\b/i,
  /^\/\/+/,
] as const;

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly prisma: PrismaService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<HttpRequestLike>();
    const response = ctx.getResponse();

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

    const requestId = store?.requestId || 'N/A';
    const method = request.method ?? 'UNKNOWN';
    const url = request.url ?? httpAdapter.getRequestUrl(request);
    const isScannerNotFound = this.isScannerNotFound(status, method, url);

    // 1. Log para Observabilidade
    if (isScannerNotFound) {
      this.logger.warn(
        `[${requestId}] Scanner 404 ignorado para auditoria: ${method} ${url}`,
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
    if (!isScannerNotFound) {
      const payload: Prisma.InputJsonObject = {
        path: url,
        method,
        error: this.serializeMessage(message),
      };

      if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
        payload.stack = exception.stack;
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
            payload,
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
    const responseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(request),
      requestId: requestId, // ID de rastreio para o suporte
      message: this.extractClientMessage(message),
    };

    httpAdapter.reply(response, responseBody, status);
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

  private serializeMessage(message: unknown): Prisma.InputJsonValue {
    if (
      message === null ||
      typeof message === 'string' ||
      typeof message === 'number' ||
      typeof message === 'boolean'
    ) {
      return message;
    }

    return redactDeep(message) as Prisma.InputJsonValue;
  }
}
