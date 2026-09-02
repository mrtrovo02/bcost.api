import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
} from '@nestjs/throttler';
import { THROTTLE_ENDPOINT_LIMIT } from '../decorators/throttle-endpoint.decorator.js';

/**
 * Guard customizado que respeita @ThrottleEndpoint.
 *
 * Mantém a lógica do guard nativo do NestJS, mas permite sobrescrever
 * o limite por endpoint quando o decorator está presente.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: any,
    @Inject(getStorageToken()) storageService: any,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const endpointLimit = this.reflector.get<{ limit: number; ttl: number }>(
      THROTTLE_ENDPOINT_LIMIT,
      context.getHandler(),
    );

    if (!endpointLimit) {
      return super.canActivate(context);
    }

    const originalOptions = this.options;
    const originalThrottlers = this.throttlers;
    const originalCommonOptions = this.commonOptions;

    try {
      const customOptions = Array.isArray(this.options)
        ? [{ name: 'default', ttl: endpointLimit.ttl, limit: endpointLimit.limit }]
        : {
            ...this.options,
            throttlers: [
              {
                name: 'default',
                ttl: endpointLimit.ttl,
                limit: endpointLimit.limit,
              },
            ],
          };

      (this as any).options = customOptions;
      await this.onModuleInit();
      return await super.canActivate(context);
    } finally {
      (this as any).options = originalOptions;
      this.throttlers = originalThrottlers;
      this.commonOptions = originalCommonOptions;
    }
  }
}
