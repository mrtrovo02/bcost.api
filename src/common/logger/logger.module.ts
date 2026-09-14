import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import {
  LOGGER_REDACTION_CENSOR,
  LOGGER_REDACTION_PATHS,
} from './logger-redaction.config.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',
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
