import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyAccessGuard } from './company-access.guard.js';

describe('CompanyAccessGuard', () => {
  const guard = new CompanyAccessGuard({} as Reflector);

  function createContext(input: {
    companyId?: string;
    user?: {
      companyId?: string | null;
      activeCompanyId?: string | null;
      companyIds?: string[];
      rolesByCompany?: Record<string, string>;
      role?: string | null;
    };
  }): ExecutionContext {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: {},
          params: input.companyId ? { companyId: input.companyId } : {},
          query: {},
          body: {},
          user: input.user,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('permite tenant vinculado mesmo quando nao e a empresa ativa do token', () => {
    const user = {
      companyId: 'company-active',
      companyIds: ['company-active', 'company-secondary'],
      rolesByCompany: {
        'company-active': 'OWNER',
        'company-secondary': 'MANAGER',
      },
      role: 'OWNER',
    };

    const context = createContext({
      companyId: 'company-secondary',
      user,
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(user.companyId).toBe('company-secondary');
    expect(user.role).toBe('MANAGER');
  });

  it('bloqueia tenant que nao pertence ao usuario', () => {
    const context = createContext({
      companyId: 'company-external',
      user: {
        companyId: 'company-active',
        companyIds: ['company-active'],
        role: 'OWNER',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('permite rotas sem companyId explicito', () => {
    const context = createContext({
      user: {
        companyId: 'company-active',
        companyIds: ['company-active'],
        role: 'OWNER',
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
