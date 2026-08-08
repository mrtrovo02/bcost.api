'use strict';

import type { ConfigService } from '@nestjs/config';

export type CorsOriginConfig = true | string[] | RegExp[];

export function parseCsvList(value?: string | null): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveCorsOrigins(
  configuredOrigins: string | undefined,
  isProd: boolean,
): CorsOriginConfig {
  const origins = parseCsvList(configuredOrigins);

  if (origins.length > 0) {
    return origins;
  }

  return isProd ? [/bcost\.com\.br$/, /peers\.company$/] : true;
}

export function resolveCorsOriginsFromConfig(
  config: ConfigService,
  isProd: boolean,
): CorsOriginConfig {
  return resolveCorsOrigins(config.get<string>('CORS_ORIGINS'), isProd);
}

export function shouldEnableSwagger(
  isProd: boolean,
  enableSwagger?: string | boolean | null,
): boolean {
  if (!isProd) {
    return true;
  }

  return enableSwagger === true || enableSwagger === 'true';
}
