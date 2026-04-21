'use strict';

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('bCost-Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(async () => {
        const responseTime = Date.now() - startTime;
        const { method, url, user, body, ip } = request;
        const companyId =
          request.companyId ||
          user?.companyId ||
          request.params?.companyId ||
          body?.companyId ||
          request.headers?.['x-company-id'];

        try {
          await this.prisma.auditLog.create({
            data: {
              action: `${method} ${url}`,
              module: this.extractModule(url),
              payload: this.sanitizeBody(body),
              userId: user?.id || null,
              companyId: companyId || null,
              responseTime,
              statusCode: context.switchToHttp().getResponse().statusCode,
              ipAddress:
                ip || request.headers['x-forwarded-for'] || '127.0.0.1',
              userAgent: request.headers['user-agent'],
            },
          });
        } catch (error: any) {
          this.logger.error(
            `❌ Falha ao persistir log de auditoria: ${error.message}`,
          );
        }
      }),
    );
  }

  private extractModule(url: string): string {
    const parts = url.split('/');
    return parts[2]?.toUpperCase() || 'SYSTEM';
  }

  private sanitizeBody(body: any): any {
    if (!body) return {};
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    const sanitized = { ...body };
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) sanitized[field] = '********';
    });
    return sanitized;
  }
}
