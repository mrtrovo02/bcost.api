import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerGenerateKeyFunction,
  ThrottlerGetTrackerFunction,
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { THROTTLE_ENDPOINT_LIMIT } from '../decorators/throttle-endpoint.decorator.js';

interface EndpointThrottleLimit {
  limit: number;
  ttl: number;
}

/**
 * Guard customizado que respeita @ThrottleEndpoint.
 *
 * Mantém a lógica do guard nativo do NestJS, mas permite sobrescrever
 * o limite por endpoint quando o decorator está presente, sem mutar
 * `this.options` em runtime. Como o guard é singleton, mutar options
 * durante uma requisição pode vazar limite entre endpoints concorrentes.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const endpointLimit = this.reflector.get<EndpointThrottleLimit>(
      THROTTLE_ENDPOINT_LIMIT,
      context.getHandler(),
    );

    if (!endpointLimit) {
      return super.canActivate(context);
    }

    if (await this.shouldSkip(context)) {
      return true;
    }

    const throttler = this.createEndpointThrottler(endpointLimit);
    const getTracker = this.resolveTracker(throttler);
    const generateKey = this.resolveKeyGenerator(throttler);
    const limit = await this.resolveNumericOption(context, throttler.limit);
    const ttl = await this.resolveNumericOption(context, throttler.ttl);

    return this.handleRequest(
      context,
      limit,
      ttl,
      throttler,
      getTracker,
      generateKey,
    );
  }

  private createEndpointThrottler(
    endpointLimit: EndpointThrottleLimit,
  ): ThrottlerOptions {
    return {
      name: 'default',
      limit: endpointLimit.limit,
      ttl: endpointLimit.ttl,
    };
  }

  private resolveTracker(
    throttler: ThrottlerOptions,
  ): ThrottlerGetTrackerFunction {
    return (
      throttler.getTracker ??
      this.commonOptions?.getTracker ??
      this.getTracker.bind(this)
    );
  }

  private resolveKeyGenerator(
    throttler: ThrottlerOptions,
  ): ThrottlerGenerateKeyFunction {
    return (
      throttler.generateKey ??
      this.commonOptions?.generateKey ??
      this.generateKey.bind(this)
    );
  }

  private async resolveNumericOption(
    context: ExecutionContext,
    value: ThrottlerOptions['limit'] | ThrottlerOptions['ttl'],
  ): Promise<number> {
    return typeof value === 'function' ? value(context) : value;
  }
}
