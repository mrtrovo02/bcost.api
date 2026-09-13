'use strict';

import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { CustomThrottlerGuard } from './throttle-guard-custom.js';
import { THROTTLE_ENDPOINT_LIMIT } from '../decorators/throttle-endpoint.decorator.js';

type TestRequest = {
  ip: string;
  headers: Record<string, string>;
};

type TestResponse = {
  header: jest.Mock;
};

function createContext(
  request: TestRequest,
  response: TestResponse,
): ExecutionContext {
  function ControllerFixture() {}
  function handlerFixture() {}

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => handlerFixture,
    getClass: () => ControllerFixture,
  } as unknown as ExecutionContext;
}

function createReflector(endpointLimit?: {
  limit: number;
  ttl: number;
}): Reflector {
  return {
    get: jest.fn((metadataKey: string) =>
      metadataKey === THROTTLE_ENDPOINT_LIMIT ? endpointLimit : undefined,
    ),
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as unknown as Reflector;
}

function createStorage(totalHits: number): ThrottlerStorage {
  return {
    increment: jest.fn().mockResolvedValue({
      totalHits,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  };
}

describe('CustomThrottlerGuard', () => {
  const request: TestRequest = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  };

  it('deve aplicar limite especifico do @ThrottleEndpoint sem mutar options globais', async () => {
    const options: ThrottlerModuleOptions = [
      { name: 'default', ttl: 60000, limit: 100 },
    ];
    const storage = createStorage(3);
    const response: TestResponse = { header: jest.fn() };
    const guard = new CustomThrottlerGuard(
      options,
      storage,
      createReflector({ limit: 5, ttl: 300000 }),
    );

    await guard.onModuleInit();

    await expect(
      guard.canActivate(createContext(request, response)),
    ).resolves.toBe(true);

    expect(storage.increment).toHaveBeenCalledWith(expect.any(String), 300000);
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 2);
    expect(options).toEqual([{ name: 'default', ttl: 60000, limit: 100 }]);
  });

  it('deve preservar comportamento global quando endpoint nao tem decorator', async () => {
    const options: ThrottlerModuleOptions = [
      { name: 'default', ttl: 60000, limit: 100 },
    ];
    const storage = createStorage(10);
    const response: TestResponse = { header: jest.fn() };
    const guard = new CustomThrottlerGuard(options, storage, createReflector());

    await guard.onModuleInit();

    await expect(
      guard.canActivate(createContext(request, response)),
    ).resolves.toBe(true);

    expect(storage.increment).toHaveBeenCalledWith(expect.any(String), 60000);
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 90);
  });
});
