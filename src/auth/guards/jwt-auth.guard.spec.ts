'use strict';

import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';

type TestRequest = {
  headers: Record<string, string>;
  user?: {
    id: string;
    email: string;
    companyId?: string | null;
    activeCompanyId?: string | null;
    role?: string | null;
  };
};

function createExecutionContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function createReflector(isPublic = false): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowDemoSession = process.env.ALLOW_DEMO_SESSION;
  const originalEnableDemoFallback = process.env.ENABLE_DEMO_FALLBACK;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_DEMO_SESSION = originalAllowDemoSession;
    process.env.ENABLE_DEMO_FALLBACK = originalEnableDemoFallback;
  });

  it('never accepts demo session bypass in production even when fallback flags are enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_SESSION = 'false';
    process.env.ENABLE_DEMO_FALLBACK = 'true';

    const request: TestRequest = {
      headers: {
        authorization: 'Bearer demo-token-local',
        'x-demo-session': 'true',
      },
    };
    const guard = new JwtAuthGuard(createReflector());
    const parentPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => boolean;
    };
    const parentCanActivateSpy = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockReturnValueOnce(false);

    expect(guard.canActivate(createExecutionContext(request))).toBe(false);
    expect(parentCanActivateSpy).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });

  it('does not accept demo session headers in production when demo fallback is disabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_SESSION = 'false';
    process.env.ENABLE_DEMO_FALLBACK = 'false';

    const request: TestRequest = {
      headers: {
        authorization: 'Bearer demo-token-local',
        'x-demo-session': 'true',
      },
    };
    const guard = new JwtAuthGuard(createReflector());
    const parentPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => boolean;
    };
    const parentCanActivateSpy = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockReturnValueOnce(false);

    expect(guard.canActivate(createExecutionContext(request))).toBe(false);
    expect(parentCanActivateSpy).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });

  it('does not accept demo session header alone in production even when demo is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_SESSION = 'true';
    process.env.ENABLE_DEMO_FALLBACK = 'true';

    const request: TestRequest = {
      headers: {
        'x-demo-session': 'true',
      },
    };
    const guard = new JwtAuthGuard(createReflector());
    const parentPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => boolean;
    };
    const parentCanActivateSpy = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockReturnValueOnce(false);

    expect(guard.canActivate(createExecutionContext(request))).toBe(false);
    expect(parentCanActivateSpy).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });

  it('does not accept tokens that only resemble the demo token in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_SESSION = 'true';
    process.env.ENABLE_DEMO_FALLBACK = 'true';

    const request: TestRequest = {
      headers: {
        authorization: 'Bearer demo-local-forged-token',
        'x-demo-session': 'true',
      },
    };
    const guard = new JwtAuthGuard(createReflector());
    const parentPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => boolean;
    };
    const parentCanActivateSpy = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockReturnValueOnce(false);

    expect(guard.canActivate(createExecutionContext(request))).toBe(false);
    expect(parentCanActivateSpy).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });

  it('keeps public routes bypassed without requiring demo headers', () => {
    const request: TestRequest = {
      headers: {},
    };
    const guard = new JwtAuthGuard(createReflector(true));

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('delegates demo-like tokens to passport even outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEMO_SESSION = 'false';
    process.env.ENABLE_DEMO_FALLBACK = 'false';

    const request: TestRequest = {
      headers: {
        authorization: 'Bearer demo-token-local',
      },
    };
    const guard = new JwtAuthGuard(createReflector());
    const parentPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (context: ExecutionContext) => boolean;
    };
    const parentCanActivateSpy = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockReturnValueOnce(false);

    expect(guard.canActivate(createExecutionContext(request))).toBe(false);
    expect(parentCanActivateSpy).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });
});
