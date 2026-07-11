import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exceptionResponse;
      } else {
        message = (exceptionResponse as any).message || exceptionResponse;
        error = (exceptionResponse as any).error || 'HttpException';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Erro interno do servidor';
      error = 'Internal Server Error';

      // Log do erro inesperado (com stack trace apenas em desenvolvimento)
      this.logger.error(
        `Erro não tratado: ${exception instanceof Error ? exception.message : exception}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Em produção, não envie detalhes sensíveis
    const isProduction = process.env.NODE_ENV === 'production';
    const responseBody: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error,
    };

    if (!isProduction) {
      responseBody.message = message;
      if (exception instanceof Error && !(exception instanceof HttpException)) {
        responseBody.stack = exception.stack;
      }
    } else {
      // Em produção, para erros 5xx, não mostre detalhes internos
      if (status >= 500) {
        responseBody.message = 'Erro interno do servidor';
      } else {
        responseBody.message = message;
      }
    }

    response.status(status).json(responseBody);
  }
}
