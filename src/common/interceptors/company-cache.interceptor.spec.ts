import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyCacheInterceptor } from './company-cache.interceptor.js';

interface MockCacheRequest {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  companyId?: string | null;
  user?: {
    companyId?: string | null;
    activeCompanyId?: string | null;
  };
}

type CompanyCacheInterceptorConstructor = new (
  cacheManager: unknown,
  reflector: Reflector,
) => CompanyCacheInterceptor;

describe('CompanyCacheInterceptor', () => {
  const createInterceptor = (): CompanyCacheInterceptor => {
    const Constructor =
      CompanyCacheInterceptor as unknown as CompanyCacheInterceptorConstructor;

    return new Constructor({}, new Reflector());
  };

  const createContext = (request: MockCacheRequest): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
    }) as unknown as ExecutionContext;

  it('nao gera chave de cache para metodos que nao sao GET', () => {
    const interceptor = createInterceptor();

    expect(
      interceptor.trackBy(
        createContext({
          method: 'POST',
          url: '/api/v1/insights/executive-summary/company-1',
          params: { companyId: 'company-1' },
        }),
      ),
    ).toBeUndefined();
  });

  it('prioriza companyId resolvido no request para manter alinhamento com TenantContext', () => {
    const interceptor = createInterceptor();

    const cacheKey = interceptor.trackBy(
      createContext({
        method: 'GET',
        url: '/api/v1/insights/executive-summary/company-request',
        companyId: ' company-request ',
        params: { companyId: 'company-route' },
        query: { company_id: 'company-query' },
        user: { activeCompanyId: 'company-active', companyId: 'company-token' },
      }),
    );

    expect(cacheKey).toBe(
      'company:company-request:url:/api/v1/insights/executive-summary/company-request',
    );
  });

  it('aceita query company_id antes do companyId ativo do usuario', () => {
    const interceptor = createInterceptor();

    const cacheKey = interceptor.trackBy(
      createContext({
        method: 'GET',
        url: '/api/v1/insights/historical-trends/company-query?company_id=company-query',
        query: { company_id: 'company-query' },
        user: { activeCompanyId: 'company-active' },
      }),
    );

    expect(cacheKey).toBe(
      'company:company-query:url:/api/v1/insights/historical-trends/company-query?company_id=company-query',
    );
  });

  it('aceita x-company-id sem depender da caixa do header', () => {
    const interceptor = createInterceptor();

    const cacheKey = interceptor.trackBy(
      createContext({
        method: 'GET',
        url: '/api/v1/insights/health',
        headers: { 'X-Company-Id': ['company-header'] },
      }),
    );

    expect(cacheKey).toBe('company:company-header:url:/api/v1/insights/health');
  });
});
