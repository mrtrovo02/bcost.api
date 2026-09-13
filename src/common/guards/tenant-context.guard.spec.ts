import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContext } from '../tenant/tenant.context.js';
import { TenantContextGuard } from './tenant-context.guard.js';

interface MockTenantRequest {
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: {
    id?: string | null;
    sub?: string | null;
    role?: string | null;
    activeCompanyId?: string | null;
    companyId?: string | null;
  };
  companyId?: string | null;
  traceId?: unknown;
}

interface MockPrismaRlsContextClient {
  setRlsCompanyContext: jest.Mock<Promise<void>, [string]>;
  clearRlsCompanyContext: jest.Mock<Promise<void>, []>;
}

describe('TenantContextGuard', () => {
  let prisma: MockPrismaRlsContextClient;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let guard: TenantContextGuard;

  beforeEach(() => {
    prisma = {
      setRlsCompanyContext: jest
        .fn<Promise<void>, [string]>()
        .mockResolvedValue(),
      clearRlsCompanyContext: jest.fn<Promise<void>, []>().mockResolvedValue(),
    };
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    guard = new TenantContextGuard(reflector as Reflector, prisma);
  });

  function createContext(request: MockTenantRequest): ExecutionContext {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
      getHandler: jest.fn().mockReturnValue(function mockHandler() {
        return undefined;
      }),
      getClass: jest.fn().mockReturnValue(class MockController {}),
    } as unknown as ExecutionContext;
  }

  it('resolve company_id no body e injeta o tenant no AsyncLocalStorage', async () => {
    const request: MockTenantRequest = {
      body: {
        company_id: ' company-body ',
      },
      user: {
        id: 'user-1',
        activeCompanyId: 'company-active',
        role: 'OWNER',
      },
    };

    await TenantContext.run({ requestId: 'req-body' }, async () => {
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
      expect(request.companyId).toBe('company-body');
      expect(TenantContext.getTenantId()).toBe('company-body');
      expect(TenantContext.getUserId()).toBe('user-1');
      expect(prisma.setRlsCompanyContext).toHaveBeenCalledWith('company-body');
    });
  });

  it('resolve x-company-id e trace id sem depender da caixa dos headers', async () => {
    const request: MockTenantRequest = {
      headers: {
        'X-Company-Id': 'company-header',
        'X-Bcost-Trace-Id': 'trace-header',
      },
      user: {
        sub: 'user-sub',
        companyId: 'company-token',
        role: 'MANAGER',
      },
    };

    await TenantContext.run({ requestId: 'req-header' }, async () => {
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
      expect(request.companyId).toBe('company-header');
      expect(request.traceId).toBe('trace-header');
      expect(TenantContext.getTenantId()).toBe('company-header');
      expect(TenantContext.getUserId()).toBe('user-sub');
      expect(prisma.setRlsCompanyContext).toHaveBeenCalledWith(
        'company-header',
      );
    });
  });

  it('usa empresa ativa do usuario quando a requisicao nao informa companyId', async () => {
    const request: MockTenantRequest = {
      user: {
        id: 'user-2',
        activeCompanyId: 'company-active',
        companyId: 'company-legacy',
        role: 'ACCOUNTANT',
      },
    };

    await TenantContext.run({ requestId: 'req-fallback' }, async () => {
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
      expect(request.companyId).toBe('company-active');
      expect(TenantContext.getTenantId()).toBe('company-active');
      expect(TenantContext.getUserId()).toBe('user-2');
      expect(prisma.setRlsCompanyContext).toHaveBeenCalledWith(
        'company-active',
      );
    });
  });

  it('bloqueia companyId conflitante antes de sincronizar RLS', async () => {
    const request: MockTenantRequest = {
      params: { companyId: 'company-route' },
      headers: { 'x-company-id': 'company-header' },
      user: {
        id: 'user-3',
        activeCompanyId: 'company-route',
        role: 'OWNER',
      },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.setRlsCompanyContext).not.toHaveBeenCalled();
    expect(prisma.clearRlsCompanyContext).not.toHaveBeenCalled();
  });

  it('limpa contexto RLS quando nao ha empresa resolvida', async () => {
    const request: MockTenantRequest = {
      user: {
        id: 'user-4',
        role: 'OWNER',
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.companyId).toBeNull();
    expect(prisma.clearRlsCompanyContext).toHaveBeenCalledTimes(1);
    expect(prisma.setRlsCompanyContext).not.toHaveBeenCalled();
  });

  it('ignora empresa ativa e limpa RLS em rota account-scoped marcada com SkipCompanyCheck', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);

    const request: MockTenantRequest = {
      user: {
        id: 'user-6',
        activeCompanyId: 'company-active',
        companyId: 'company-legacy',
        role: 'OWNER',
      },
    };

    await TenantContext.run({ requestId: 'req-account-scope' }, async () => {
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
      expect(request.companyId).toBeNull();
      expect(TenantContext.getTenantId()).toBeUndefined();
      expect(TenantContext.getUserId()).toBe('user-6');
      expect(prisma.clearRlsCompanyContext).toHaveBeenCalledTimes(1);
      expect(prisma.setRlsCompanyContext).not.toHaveBeenCalled();
    });
  });

  it('falha fechado em producao quando RLS nao pode ser sincronizado', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    prisma.setRlsCompanyContext.mockRejectedValueOnce(new Error('rls down'));

    const request: MockTenantRequest = {
      params: { companyId: 'company-prod' },
      user: {
        id: 'user-5',
        activeCompanyId: 'company-prod',
        role: 'OWNER',
      },
    };

    try {
      await expect(guard.canActivate(createContext(request))).rejects.toThrow(
        ServiceUnavailableException,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
