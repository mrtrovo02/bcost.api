'use strict';

import type { ConfigService } from '@nestjs/config';

export type CorsOriginConfig = true | string[] | RegExp[];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toUrlOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function parseCsvList(value?: string | null): string[] {
  const raw = value || '';
  const urlMatches = raw.match(/https?:\/\/[^\s,\])]+/gi) ?? [];

  if (urlMatches.length > 0) {
    return unique(urlMatches.map(toUrlOrigin).filter((item): item is string => Boolean(item)));
  }

  return unique(raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean));
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
