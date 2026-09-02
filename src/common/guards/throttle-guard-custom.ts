import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { ThrottlerGuard, THROTTLER_OPTIONS } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { THROTTLE_ENDPOINT_LIMIT } from '../decorators/throttle-endpoint.decorator.js';

/**
 * Guard customizado que respeita @ThrottleEndpoint
 *
 * Se endpoint tem decorator, usa aquele limit
 * Senão, usa default global (100 req/60s)
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(THROTTLER_OPTIONS) private throttlerOptions: any[],
    private readonly reflector: Reflector,
  ) {
    super(throttlerOptions);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Lê decorator @ThrottleEndpoint se existir
    const endpointLimit = this.reflector.get<{ limit: number; ttl: number }>(
      THROTTLE_ENDPOINT_LIMIT,
      context.getHandler(),
    );

    if (endpointLimit) {
      // Sobrescreve limite global com limite do endpoint temporariamente
      const originalLimits = this.throttlerOptions;
      
      this.throttlerOptions = [
        {
          name: 'default',
          ttl: endpointLimit.ttl,
          limit: endpointLimit.limit,
        },
      ];

      try {
        // Executa com novo limite
        const result = await super.canActivate(context);
        return result;
      } finally {
        // Restaura limits originais
        this.throttlerOptions = originalLimits;
      }
    }

    // Sem decorator = usa default
    return super.canActivate(context);
  }
}
