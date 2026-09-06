'use strict';

import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CompanyRole, TaxRegime } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { TwoFAService } from './2fa.service.js';
import { AuthService } from './auth.service.js';

interface MockConfigService {
  get: jest.Mock;
}

interface MockUserDelegate {
  upsert: jest.Mock;
}

interface MockCompanyDelegate {
  upsert: jest.Mock;
}

interface MockCompanyUserDelegate {
  upsert: jest.Mock;
}

interface MockPrismaService {
  user: MockUserDelegate;
  company: MockCompanyDelegate;
  companyUser: MockCompanyUserDelegate;
}

function createConfig(
  values: Record<string, string | undefined>,
): MockConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

function createPrisma(): MockPrismaService {
  return {
    user: {
      upsert: jest.fn(),
    },
    company: {
      upsert: jest.fn(),
    },
    companyUser: {
      upsert: jest.fn(),
    },
  };
}

function createService(
  prisma: MockPrismaService,
  config: MockConfigService,
): AuthService {
  return new AuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    config as unknown as ConfigService,
    {} as TwoFAService,
  );
}

describe('AuthService setupAdmin security', () => {
  it('deve bloquear setupAdmin em producao mesmo com ALLOW_SETUP_ADMIN=true', async () => {
    const prisma = createPrisma();
    const config = createConfig({
      NODE_ENV: 'production',
      ALLOW_SETUP_ADMIN: 'true',
    });
    const service = createService(prisma, config);

    await expect(service.setupAdmin()).rejects.toThrow(ForbiddenException);
    await expect(service.setupAdmin()).rejects.toThrow(
      'Admin setup is disabled in production environment',
    );

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.company.upsert).not.toHaveBeenCalled();
    expect(prisma.companyUser.upsert).not.toHaveBeenCalled();
  });

  it('deve bloquear setupAdmin fora de producao quando ALLOW_SETUP_ADMIN=false', async () => {
    const prisma = createPrisma();
    const config = createConfig({
      NODE_ENV: 'development',
      ALLOW_SETUP_ADMIN: 'false',
    });
    const service = createService(prisma, config);

    await expect(service.setupAdmin()).rejects.toThrow(
      'Operation not allowed. ALLOW_SETUP_ADMIN is not enabled.',
    );

    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('deve bloquear setupAdmin quando a senha explicita nao esta configurada', async () => {
    const prisma = createPrisma();
    const config = createConfig({
      NODE_ENV: 'development',
      ALLOW_SETUP_ADMIN: 'true',
      SETUP_ADMIN_PASSWORD: '',
    });
    const service = createService(prisma, config);

    await expect(service.setupAdmin()).rejects.toThrow(
      'SETUP_ADMIN_PASSWORD must be explicitly configured with at least 16 characters.',
    );

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.company.upsert).not.toHaveBeenCalled();
    expect(prisma.companyUser.upsert).not.toHaveBeenCalled();
  });

  it('deve permitir setupAdmin apenas fora de producao com flag explicita', async () => {
    const prisma = createPrisma();
    const config = createConfig({
      NODE_ENV: 'development',
      ALLOW_SETUP_ADMIN: 'true',
      SETUP_ADMIN_PASSWORD: 'admin_bcost_2026_secure',
    });
    const service = createService(prisma, config);

    prisma.user.upsert.mockResolvedValue({
      id: 'user-admin-001',
      email: 'contato@bcost.com.br',
      name: 'Vinícius Rafael',
    });
    prisma.company.upsert.mockResolvedValue({
      id: 'company-admin-001',
      name: 'bCost Enterprise Solutions',
      cnpj: '00000000000191',
      taxRegime: TaxRegime.SIMPLES_NACIONAL,
    });
    prisma.companyUser.upsert.mockResolvedValue({
      userId: 'user-admin-001',
      companyId: 'company-admin-001',
      role: CompanyRole.OWNER,
    });

    const result = await service.setupAdmin();

    expect(result.user.id).toBe('user-admin-001');
    expect(result.company.id).toBe('company-admin-001');
    expect(result.credentials).toEqual({ email: 'contato@bcost.com.br' });
    expect(prisma.companyUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { role: CompanyRole.OWNER },
      }),
    );
  });
});
