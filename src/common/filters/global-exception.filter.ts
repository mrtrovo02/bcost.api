import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { contextStorage } from '../context/context.storage.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  redactDeep,
  redactSensitiveHeaders,
} from '../security/redact-headers.util.js';

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
    const request = ctx.getRequest();
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

    // 1. Log para Observabilidade
    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} - Status: ${status}`,
      exception instanceof Error
        ? exception.stack
        : JSON.stringify(redactDeep(exception)),
    );

    // 2. Persistência no AuditLog (Correção Técnica de Tipagem)
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
          payload: {
            path: request.url,
            method: request.method,
            error: message,
            stack:
              process.env.NODE_ENV !== 'production' &&
              exception instanceof Error
                ? exception.stack
                : undefined,
          } as any, // 'as any' aqui permite salvar o JSON sem conflito de profundidade de tipo
          ipAddress: request.ip,
          userAgent: String(
            redactSensitiveHeaders(request.headers as Record<string, unknown>)[
              'user-agent'
            ] ?? '',
          ),
        },
      })
      .catch((err) => this.logger.error('CRITICAL: AuditLog Failed', err));

    // 3. Resposta Padronizada (Contrato Enterprise)
    const responseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(request),
      requestId: requestId, // ID de rastreio para o suporte
      message:
        typeof message === 'object'
          ? (message as any).message || message
          : message,
    };

    httpAdapter.reply(response, responseBody, status);
  }
}
