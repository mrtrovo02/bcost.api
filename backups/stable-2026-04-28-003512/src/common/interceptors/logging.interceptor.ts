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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startedAt = Date.now();

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest & { user?: any; companyId?: string }>();
    const reply = http.getResponse<FastifyReply>();

    const method = request.method;
    const url = request.url;
    const headers = request.headers;
    const ipAddress =
      (headers['x-forwarded-for'] as string) ||
      request.ip ||
      '127.0.0.1';

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

        error: (error) => {
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
              error: error?.message,
            },
          });
        },
      }),
    );
  }

  private emitAudit(payload: Record<string, any>): void {
    try {
      this.eventEmitter.emit('audit.log', payload);
    } catch (error) {
      this.logger.error(
        `Falha ao emitir evento audit.log: ${error?.message}`,
        error?.stack,
      );
    }
  }

  private extractModule(url: string): string {
    const clean = url.split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    const ignored = new Set(['api', 'v1', 'v2']);
    return (parts.find((part) => !ignored.has(part)) || 'system').toUpperCase();
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const blocked = ['authorization', 'cookie', 'set-cookie'];
    const sanitized: Record<string, any> = {};

    for (const key in headers) {
      sanitized[key] = blocked.includes(key.toLowerCase())
        ? '[REDACTED]'
        : headers[key];
    }

    return sanitized;
  }
}
