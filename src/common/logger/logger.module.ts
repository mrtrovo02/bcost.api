import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import {
  LOGGER_REDACTION_CENSOR,
  LOGGER_REDACTION_PATHS,
} from './logger-redaction.config.js';

type HttpRequestWithUrl = {
  url?: string;
};

const LOW_NOISE_HTTP_LOG_PATHS = new Set([
  '/',
  '/api',
  '/health',
  '/api/health',
  '/api/v1/health',
  '/live',
  '/api/live',
  '/api/v1/live',
  '/ready',
  '/api/ready',
  '/api/v1/ready',
  '/robots.txt',
  '/metrics',
]);

export function shouldSkipHttpAccessLog(request: HttpRequestWithUrl): boolean {
  const path = (request.url ?? '').split('?')[0];
  return LOW_NOISE_HTTP_LOG_PATHS.has(path);
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',
        autoLogging: {
          ignore: shouldSkipHttpAccessLog,
        },
        redact: {
          paths: [...LOGGER_REDACTION_PATHS],
          censor: LOGGER_REDACTION_CENSOR,
        },
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      },
    }),
  ],
})
export class AppLoggerModule {}
