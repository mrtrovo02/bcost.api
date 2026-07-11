'use strict';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'proxy-authorization',
]);

export function redactSensitiveHeaders(
  headers: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!headers || typeof headers !== 'object') return {};

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      const normalizedKey = key.toLowerCase();

      if (SENSITIVE_HEADER_NAMES.has(normalizedKey)) {
        return [key, '[REDACTED]'];
      }

      return [key, value];
    }),
  );
}

export function redactSensitiveValue(key: string, value: unknown): unknown {
  const normalizedKey = String(key || '').toLowerCase();

  if (
    normalizedKey.includes('authorization') ||
    normalizedKey.includes('cookie') ||
    normalizedKey.includes('token') ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('password')
  ) {
    return '[REDACTED]';
  }

  return value;
}

export function redactDeep<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, innerValue] of Object.entries(value as Record<string, unknown>)) {
    output[key] = redactSensitiveValue(key, redactDeep(innerValue));
  }

  return output as T;
}
