import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { CompanyRole } from '@prisma/client';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockExecutionContext = (user?: {
    role: CompanyRole;
  }): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('deve permitir acesso quando nenhuma role for requerida na rota', () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const context = mockExecutionContext({ role: CompanyRole.VIEWER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('deve permitir acesso quando o usuário possui a role exigida', () => {
    reflector.getAllAndOverride.mockReturnValue([CompanyRole.OWNER]);
    const context = mockExecutionContext({ role: CompanyRole.OWNER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('deve lançar ForbiddenException quando o usuário não possui a role necessária', () => {
    reflector.getAllAndOverride.mockReturnValue([CompanyRole.OWNER]);
    const context = mockExecutionContext({ role: CompanyRole.VIEWER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException se não houver usuário no request', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const context = mockExecutionContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
