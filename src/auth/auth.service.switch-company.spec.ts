'use strict';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CompanyRole, TaxRegime } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TwoFAService } from './2fa.service.js';
import { AuthService } from './auth.service.js';

interface MockPrismaService {
  user: {
    findUnique: jest.Mock;
  };
  userSession: {
    create: jest.Mock;
  };
  withRlsUserContext: jest.Mock;
}

describe('AuthService switchCompany', () => {
  let service: AuthService;
  let prisma: MockPrismaService;
  let jwtService: { sign: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({ id: 'session-switch-001' }),
      },
      withRlsUserContext: jest
        .fn()
        .mockImplementation((_userId: string, handler: (tx: unknown) => unknown) =>
          handler(prisma),
        ),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('access-token-company-b'),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      {} as ConfigService,
      {} as TwoFAService,
    );
  });

  it('retorna contrato completo de login ao trocar a empresa ativa', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-amanda',
      email: 'amandacontabil@bcost.com.br',
      name: 'Amanda Narvaes',
      password: 'unused',
      active: true,
      twoFactor: false,
      twoFactorPending: false,
      companies: [
        {
          companyId: 'company-a',
          role: CompanyRole.OWNER,
          company: {
            id: 'company-a',
            name: 'Primeira Empresa LTDA',
            cnpj: '11111111000191',
            active: true,
            taxRegime: TaxRegime.SIMPLES_NACIONAL,
            planLevel: 'FREE',
          },
        },
        {
          companyId: 'company-amel',
          role: CompanyRole.MANAGER,
          company: {
            id: 'company-amel',
            name: 'Amel Contabilidade Digital LTDA',
            cnpj: '22222222000191',
            active: true,
            taxRegime: TaxRegime.LUCRO_PRESUMIDO,
            planLevel: 'PRO',
          },
        },
      ],
    });

    const response = await service.switchCompany('user-amanda', 'company-amel');

    expect(prisma.withRlsUserContext).toHaveBeenCalledWith(
      'user-amanda',
      expect.any(Function),
    );
    expect(response.access_token).toBe('access-token-company-b');
    expect(response.companyId).toBe('company-amel');
    expect(response.activeCompanyId).toBe('company-amel');
    expect(response.companies).toHaveLength(2);
    expect(response.user).toEqual(
      expect.objectContaining({
        id: 'user-amanda',
        email: 'amandacontabil@bcost.com.br',
        name: 'Amanda Narvaes',
        activeCompanyId: 'company-amel',
      }),
    );
    expect(response.user.companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'company-amel',
          name: 'Amel Contabilidade Digital LTDA',
          role: CompanyRole.MANAGER,
          active: true,
          planLevel: 'PRO',
        }),
      ]),
    );
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-amanda',
        email: 'amandacontabil@bcost.com.br',
        companyId: 'company-amel',
        role: CompanyRole.MANAGER,
        jti: expect.any(String),
      }),
    );
    expect(prisma.userSession.create).toHaveBeenCalledTimes(1);
  });
});
