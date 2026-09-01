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
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_DEMO_SESSION = originalAllowDemoSession;
    process.env.ENABLE_DEMO_FALLBACK = originalEnableDemoFallback;
  });

  it('accepts controlled demo sessions in production when demo fallback is enabled', () => {
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

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(request.user).toEqual({
      id: 'demo-user',
      email: 'demo@bcost.local',
      companyId: 'demo-001',
      activeCompanyId: 'demo-001',
      role: 'OWNER',
    });
  });

  it('keeps public routes bypassed without requiring demo headers', () => {
    const request: TestRequest = {
      headers: {},
    };
    const guard = new JwtAuthGuard(createReflector(true));

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
