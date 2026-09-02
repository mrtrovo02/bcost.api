import { SetMetadata } from '@nestjs/common';

export const THROTTLE_ENDPOINT_LIMIT = 'THROTTLE_ENDPOINT_LIMIT';

/**
 * Decorator para limitar requisições por endpoint específico
 *
 * @example
 * @Post('login')
 * @ThrottleEndpoint({ limit: 5, ttl: 300 })  // 5 tentativas em 5 min
 * async login() { }
 */
export function ThrottleEndpoint(options: { limit: number; ttl: number }) {
  return SetMetadata(THROTTLE_ENDPOINT_LIMIT, {
    limit: options.limit,
    ttl: options.ttl * 1000, // Converte de segundos para ms
  });
}
