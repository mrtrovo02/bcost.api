'use strict';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CompanyRole, TaxRegime } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService, MfaRequiredResponse } from './auth.service.js';
import { TwoFAService } from './2fa.service.js';

interface MockUserDelegate {
  findUnique: jest.Mock;
}

interface MockPrismaService {
  user: MockUserDelegate;
}

interface MockJwtService {
  sign: jest.Mock;
  verify: jest.Mock;
}

interface MockTwoFAService {
  verifySecondFactor: jest.Mock;
}

describe('AuthService MFA flow', () => {
  let service: AuthService;
  let mockPrisma: MockPrismaService;
  let mockJwtService: MockJwtService;
  let mockTwoFaService: MockTwoFAService;

  const user = {
    id: 'user-mfa-001',
    email: 'mfa@bcost.com.br',
    password: bcrypt.hashSync('admin_bcost_2026', 10),
    name: 'MFA User',
    active: true,
    twoFactor: true,
    twoFactorPending: false,
    companies: [
      {
        companyId: 'company-mfa-001',
        role: CompanyRole.OWNER,
        company: {
          id: 'company-mfa-001',
          name: 'bCost MFA Ltda',
          cnpj: '12345678000190',
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
        },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    mockTwoFaService = {
      verifySecondFactor: jest.fn(),
    };

    service = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockJwtService as unknown as JwtService,
      {} as ConfigService,
      mockTwoFaService as unknown as TwoFAService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve retornar sessao MFA curta quando usuario possui 2FA ativo', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockJwtService.sign.mockReturnValue('mfa-session-token');

    const response = await service.login(
      'mfa@bcost.com.br',
      'admin_bcost_2026',
    );

    expect(response.access_token).toBeNull();
    expect((response as MfaRequiredResponse).mfaRequired).toBe(true);
    expect((response as MfaRequiredResponse).mfaSession).toBe(
      'mfa-session-token',
    );
    expect(mockJwtService.sign).toHaveBeenCalledWith(
      {
        sub: user.id,
        email: user.email,
        type: 'mfa_session',
      },
      { expiresIn: '5m' },
    );
  });

  it('deve validar MFA e emitir token JWT definitivo com companyId', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: user.id,
      email: user.email,
      type: 'mfa_session',
    });
    mockJwtService.sign.mockReturnValue('access-token');
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockTwoFaService.verifySecondFactor.mockResolvedValue({
      valid: true,
      message: 'OTP verified',
      usedBackupCode: false,
    });

    const response = await service.verifyMFA('mfa-session-token', '123456');

    expect(response.access_token).toBe('access-token');
    expect(response.user.activeCompanyId).toBe('company-mfa-001');
    expect(response.user.companies).toHaveLength(1);
    expect(mockJwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: user.id,
        email: user.email,
        companyId: 'company-mfa-001',
        role: CompanyRole.OWNER,
        jti: expect.any(String),
      }),
    );
  });
});
