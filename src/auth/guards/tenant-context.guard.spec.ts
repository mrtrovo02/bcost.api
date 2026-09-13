import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CompanyRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant.context.js';
import { TenantContextGuard } from './tenant-context.guard.js';

describe('TenantContextGuard', () => {
  const jwtService = {
    verifyAsync: jest.fn(),
  } as unknown as jest.Mocked<Pick<JwtService, 'verifyAsync'>>;

  const prisma = {
    companyUser: {
      findUnique: jest.fn(),
    },
  } as unknown as jest.Mocked<Pick<PrismaService, 'companyUser'>>;

  const createGuard = () =>
    new TenantContextGuard(
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
    );

  const createMockContext = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: authorization ? { authorization } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('valida o JWT, confirma vinculo com a empresa e injeta o tenant no contexto', async () => {
    const guard = createGuard();
    const payload = {
      sub: 'user-1',
      companyId: 'company-1',
      role: CompanyRole.OWNER,
    };

    jwtService.verifyAsync.mockResolvedValue(payload);
    prisma.companyUser.findUnique.mockResolvedValue({
      id: 'membership-1',
      userId: payload.sub,
      companyId: payload.companyId,
      role: CompanyRole.OWNER,
      createdAt: new Date(),
      deletedAt: null,
    });

    await TenantContext.run({ requestId: 'req-1' }, async () => {
      await expect(
        guard.canActivate(createMockContext('Bearer token')),
      ).resolves.toBe(true);
      expect(TenantContext.getTenantId()).toBe(payload.companyId);
      expect(TenantContext.getUserId()).toBe(payload.sub);
    });
  });

  it('bloqueia requisicao sem token bearer', async () => {
    const guard = createGuard();

    await expect(guard.canActivate(createMockContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
