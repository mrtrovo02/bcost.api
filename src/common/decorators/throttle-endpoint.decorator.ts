import { SetMetadata } from '@nestjs/common';

export const THROTTLE_ENDPOINT_LIMIT = 'THROTTLE_ENDPOINT_LIMIT';

export interface ThrottleEndpointOptions {
  limit: number;
  ttl: number;
}

/**
 * Decorator para limitar requisições por endpoint específico
 *
 * @example
 * @Post('login')
 * @ThrottleEndpoint({ limit: 5, ttl: 300 })  // 5 tentativas em 5 min
 * async login() { }
 */
export function ThrottleEndpoint(options: ThrottleEndpointOptions) {
  assertPositiveInteger('limit', options.limit);
  assertPositiveInteger('ttl', options.ttl);

  return SetMetadata(THROTTLE_ENDPOINT_LIMIT, {
    limit: options.limit,
    ttl: options.ttl * 1000, // Converte de segundos para ms
  });
}

function assertPositiveInteger(name: keyof ThrottleEndpointOptions, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`ThrottleEndpoint ${name} must be a positive integer.`);
  }
}
