'use strict';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CompanyRole, TaxRegime } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import { TwoFAService } from './2fa.service.js';

interface MockDelegate {
  findUnique: jest.Mock;
  create: jest.Mock;
  updateMany: jest.Mock;
  deleteMany: jest.Mock;
}

interface MockUserDelegate {
  findUnique: jest.Mock;
}

describe('AuthService refresh sessions', () => {
  let service: AuthService;
  let userSession: MockDelegate;
  let userDelegate: MockUserDelegate;
  let jwtService: { sign: jest.Mock };
  let prisma: {
    userSession: MockDelegate;
    user: MockUserDelegate;
    withRlsUserContext: jest.Mock;
  };

  const user = {
    id: 'user-refresh-001',
    email: 'refresh@bcost.com.br',
    name: 'Refresh User',
    active: true,
    twoFactor: false,
    twoFactorPending: false,
    password: 'hashed-password',
    companies: [
      {
        companyId: 'company-refresh-001',
        role: CompanyRole.OWNER,
        company: {
          id: 'company-refresh-001',
          name: 'bCost Refresh Ltda',
          cnpj: '12345678000190',
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        },
      },
    ],
  };

  beforeEach(() => {
    userSession = {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'session-new' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    userDelegate = {
      findUnique: jest.fn().mockResolvedValue(user),
    };
    prisma = {
      userSession,
      user: userDelegate,
      withRlsUserContext: jest
        .fn()
        .mockImplementation((_userId: string, handler: (tx: unknown) => unknown) =>
          handler(prisma),
        ),
    };
    jwtService = { sign: jest.fn().mockReturnValue('access-token') };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      {} as ConfigService,
      {} as TwoFAService,
    );
  });

  it('rotaciona um refresh token válido e cria uma nova sessão', async () => {
    userSession.findUnique.mockResolvedValue({
      id: 'session-old',
      userId: user.id,
      token: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });

    const response = await service.refresh('refresh-token');

    expect(response.access_token).toBe('access-token');
    expect(response.refresh_token).toEqual(expect.any(String));
    expect(prisma.withRlsUserContext).toHaveBeenCalledWith(
      user.id,
      expect.any(Function),
    );
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-refresh-001',
        role: CompanyRole.OWNER,
      }),
    );
    expect(userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'session-old', revokedAt: null }),
        data: { revokedAt: expect.any(Date) },
      }),
    );
    expect(userSession.create).toHaveBeenCalledTimes(1);
  });

  it('revoga as sessões ativas ao detectar reutilização', async () => {
    userSession.findUnique.mockResolvedValue({
      id: 'session-reused',
      userId: user.id,
      token: 'hashed-token',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user,
    });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      response: { code: 'AUTH-REFRESH-REUSED' },
    });
    expect(userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(userSession.create).not.toHaveBeenCalled();
  });
});
