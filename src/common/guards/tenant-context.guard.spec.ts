import { ExecutionContext } from '@nestjs/common';
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

describe('TenantContextGuard', () => {
  const guard = new TenantContextGuard();

  function createContext(request: MockTenantRequest): ExecutionContext {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    } as unknown as ExecutionContext;
  }

  it('resolve company_id no body e injeta o tenant no AsyncLocalStorage', () => {
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

    TenantContext.run({ requestId: 'req-body' }, () => {
      expect(guard.canActivate(createContext(request))).toBe(true);
      expect(request.companyId).toBe('company-body');
      expect(TenantContext.getTenantId()).toBe('company-body');
      expect(TenantContext.getUserId()).toBe('user-1');
    });
  });

  it('resolve x-company-id e trace id sem depender da caixa dos headers', () => {
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

    TenantContext.run({ requestId: 'req-header' }, () => {
      expect(guard.canActivate(createContext(request))).toBe(true);
      expect(request.companyId).toBe('company-header');
      expect(request.traceId).toBe('trace-header');
      expect(TenantContext.getTenantId()).toBe('company-header');
      expect(TenantContext.getUserId()).toBe('user-sub');
    });
  });

  it('usa empresa ativa do usuario quando a requisicao nao informa companyId', () => {
    const request: MockTenantRequest = {
      user: {
        id: 'user-2',
        activeCompanyId: 'company-active',
        companyId: 'company-legacy',
        role: 'ACCOUNTANT',
      },
    };

    TenantContext.run({ requestId: 'req-fallback' }, () => {
      expect(guard.canActivate(createContext(request))).toBe(true);
      expect(request.companyId).toBe('company-active');
      expect(TenantContext.getTenantId()).toBe('company-active');
      expect(TenantContext.getUserId()).toBe('user-2');
    });
  });
});
