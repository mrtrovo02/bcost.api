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
}

describe('AuthService getProfile', () => {
  let service: AuthService;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      {} as ConfigService,
      {} as TwoFAService,
    );
  });

  it('retorna perfil completo com empresas reais vinculadas para reidratar a sessão', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-amanda',
      email: 'amandacontabil@bcost.com.br',
      name: 'Amanda Narvaes',
      active: true,
      companies: [
        {
          companyId: 'company-amel',
          role: CompanyRole.MANAGER,
          company: {
            id: 'company-amel',
            name: 'Amel Contabilidade Digital LTDA',
            cnpj: '22222222000191',
            active: true,
            taxRegime: TaxRegime.SIMPLES_NACIONAL,
          },
        },
      ],
    });

    const response = await service.getProfile('user-amanda', 'company-amel');

    expect(response).toEqual({
      id: 'user-amanda',
      email: 'amandacontabil@bcost.com.br',
      name: 'Amanda Narvaes',
      companyId: 'company-amel',
      activeCompanyId: 'company-amel',
      companies: [
        {
          id: 'company-amel',
          name: 'Amel Contabilidade Digital LTDA',
          cnpj: '22222222000191',
          role: CompanyRole.MANAGER,
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        },
      ],
      user: {
        id: 'user-amanda',
        email: 'amandacontabil@bcost.com.br',
        name: 'Amanda Narvaes',
        activeCompanyId: 'company-amel',
        companies: [
          {
            id: 'company-amel',
            name: 'Amel Contabilidade Digital LTDA',
            cnpj: '22222222000191',
            role: CompanyRole.MANAGER,
            taxRegime: TaxRegime.SIMPLES_NACIONAL,
          },
        ],
      },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-amanda' },
      include: {
        companies: {
          where: {
            deletedAt: null,
            company: { deletedAt: null, active: true },
          },
          include: { company: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });
});
