'use strict';

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { FastifyReply, FastifyRequest } from 'fastify';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { contextStorage } from '../context/context.storage.js';
import { AuditEventPayload, AuditJsonObject } from '../audit/audit.types.js';

type LoggedUser = {
  id?: string;
  sub?: string;
  companyId?: string | null;
  activeCompanyId?: string | null;
  role?: string | null;
};

type HttpErrorLike = {
  status?: number;
  statusCode?: number;
  message?: string;
  stack?: string;
};

function redactSensitiveHeaders(headers: Record<string, unknown> = {}) {
  const sensitive = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'proxy-authorization',
  ]);

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  );
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();

    const http = context.switchToHttp();
    const request = http.getRequest<
      FastifyRequest & { user?: LoggedUser; companyId?: string }
    >();
    const reply = http.getResponse<FastifyReply>();

    const method = request.method;
    const url = request.url;
    const headers = redactSensitiveHeaders(
      request.headers as Record<string, unknown>,
    );
    const ipAddress =
      (headers['x-forwarded-for'] as string) || request.ip || '127.0.0.1';

    const userAgent = (headers['user-agent'] as string) || 'unknown';
    const traceId =
      contextStorage.getStore()?.requestId ||
      (headers['x-bcost-trace-id'] as string) ||
      'no-trace';

    try {
      reply.header('x-bcost-trace-id', traceId);
    } catch {
      // nunca quebra request
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[${traceId}] ➡️ ${method} ${url} - IP: ${ipAddress}`);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - startedAt;
          const statusCode = reply.statusCode;

          this.logger.log(
            `[${traceId}] ${method} ${url} ${statusCode} - ${responseTime}ms`,
          );

          this.emitAudit({
            action: `${method} ${url}`,
            module: this.extractModule(url),
            statusCode,
            responseTime,
            ipAddress,
            userAgent,
            traceId,
            payload: {
              method,
              url,
              headers: this.sanitizeHeaders(headers),
            },
          });

          if (responseTime > 500) {
            this.logger.warn(
              `[SLOW] [${traceId}] ${method} ${url} - ${responseTime}ms`,
            );
          }
        },

        error: (error: HttpErrorLike) => {
          const responseTime = Date.now() - startedAt;
          const statusCode = error?.status || error?.statusCode || 500;

          this.logger.error(
            `[${traceId}] ${method} ${url} ERROR ${statusCode} - ${responseTime}ms - ${error?.message}`,
            error?.stack,
          );

          this.emitAudit({
            action: `${method} ${url}`,
            module: this.extractModule(url),
            statusCode,
            responseTime,
            ipAddress,
            userAgent,
            traceId,
            payload: {
              method,
              url,
              error: error?.message ?? 'Erro sem mensagem informada.',
            },
          });
        },
      }),
    );
  }

  private emitAudit(payload: AuditEventPayload): void {
    try {
      this.eventEmitter.emit('audit.log', payload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Falha ao emitir evento audit.log: ${message}`, stack);
    }
  }

  private extractModule(url: string): string {
    const clean = url.split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    const ignored = new Set(['api', 'v1', 'v2']);
    return (parts.find((part) => !ignored.has(part)) || 'system').toUpperCase();
  }

  private sanitizeHeaders(headers: Record<string, unknown>): AuditJsonObject {
    const blocked = ['authorization', 'cookie', 'set-cookie'];
    const sanitized: AuditJsonObject = {};

    for (const key in headers) {
      sanitized[key] = blocked.includes(key.toLowerCase())
        ? '[REDACTED]'
        : this.toAuditJsonValue(headers[key]);
    }

    return sanitized;
  }

  private toAuditJsonValue(value: unknown): AuditJsonObject[string] {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.toAuditJsonValue(item));
    }

    if (typeof value === 'object') {
      return '[OBJECT]';
    }

    return String(value);
  }
}
