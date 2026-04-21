import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url, body, query, params, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Log da requisição (apenas em desenvolvimento, ou com nível debug)
    this.logger.debug(
      `${method} ${url} - Body: ${JSON.stringify(body)} - Query: ${JSON.stringify(query)} - Params: ${JSON.stringify(params)}`,
    );

    return next.handle().pipe(
      tap({
        next: (data: any) => {
          const responseTime = Date.now() - startTime;
          this.logger.log(
            `${method} ${url} ${responseTime}ms - ${userAgent} ${ip}`,
          );
        },
        error: (error: any) => {
          const responseTime = Date.now() - startTime;
          this.logger.error(
            `${method} ${url} ${responseTime}ms - ${error.message}`,
          );
        },
      }),
    );
  }
}
