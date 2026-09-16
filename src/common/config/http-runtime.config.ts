'use strict';

import type { ConfigService } from '@nestjs/config';

export type CorsOriginConfig = true | string[] | RegExp[];
const PRODUCTION_CORS_ORIGINS = [
  /^https:\/\/(?:[a-z0-9-]+\.)?bcost\.com\.br$/i,
  /^https:\/\/(?:[a-z0-9-]+\.)?peers\.company$/i,
];

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

function isHttpsOrigin(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseCsvList(value?: string | null): string[] {
  const raw = value || '';
  const urlMatches = raw.match(/https?:\/\/[^\s,\])]+/gi) ?? [];

  if (urlMatches.length > 0) {
    return unique(urlMatches.map(toUrlOrigin).filter((item): item is string => Boolean(item)));
  }

  return unique(
    raw
      .split(',')
      .map((item) => toUrlOrigin(item.trim()))
      .filter((item): item is string => Boolean(item)),
  );
}

export function resolveCorsOrigins(
  configuredOrigins: string | undefined,
  isProd: boolean,
): CorsOriginConfig {
  const origins = parseCsvList(configuredOrigins);
  const productionOrigins = isProd
    ? origins.filter((origin) => isHttpsOrigin(origin))
    : origins;

  if (productionOrigins.length > 0) {
    return productionOrigins;
  }

  return isProd ? PRODUCTION_CORS_ORIGINS : true;
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
