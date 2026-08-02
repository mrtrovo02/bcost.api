import { ConfigService } from '@nestjs/config';

export const getRedisConfig = (configService: ConfigService) => ({
  host: configService.get<string>('REDIS_HOST', 'localhost'),
  port: configService.get<number>('REDIS_PORT', 6379),
  password: configService.get<string>('REDIS_PASSWORD') || undefined,
  connectTimeout: 10000,
  retryAttempts: 1,
  retryDelay: 1000,
  lazyConnect: true,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
