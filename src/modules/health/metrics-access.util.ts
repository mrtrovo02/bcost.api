import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export const METRICS_API_KEY_HEADER = 'x-api-key';

type MetricsConfig = Pick<ConfigService, 'get'>;

export function assertMetricsAccess(
  config: MetricsConfig,
  providedApiKey?: string | string[],
): void {
  const configuredKey = config.get<string>('METRICS_API_KEY')?.trim() ?? '';
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const normalizedProvidedKey = Array.isArray(providedApiKey)
    ? providedApiKey[0]
    : providedApiKey;

  if (isProduction && !configuredKey) {
    throw new UnauthorizedException('Metrics API key is required in production.');
  }

  if (configuredKey && normalizedProvidedKey !== configuredKey) {
    throw new UnauthorizedException('Invalid metrics API key.');
  }
}
