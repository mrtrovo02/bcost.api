import { ConfigService } from '@nestjs/config';

export const getRedisConfig = (configService: ConfigService) => ({
  host: configService.get<string>('REDIS_HOST', 'localhost'),
  port: configService.get<number>('REDIS_PORT', 6379),
  password: configService.get<string>('REDIS_PASSWORD'),
  connectTimeout: 10000,
  retryAttempts: 5,
  retryDelay: 1000,
});
