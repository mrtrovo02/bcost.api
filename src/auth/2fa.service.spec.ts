'use strict';

import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { PrismaService } from '../database/prisma.service.js';
import { TwoFAService } from './2fa.service.js';

interface MockUserDelegate {
  findUnique: jest.Mock;
  update: jest.Mock;
}

interface MockPrismaService {
  user: MockUserDelegate;
}

describe('TwoFAService', () => {
  let service: TwoFAService;
  let mockPrisma: MockPrismaService;

  const user = {
    id: 'user-123',
    email: 'security@bcost.com.br',
    twoFactor: false,
    twoFactorSecret: null,
    twoFactorPending: false,
    twoFactorBackupCodes: [],
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new TwoFAService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateTwoFASecret', () => {
    it('deve gerar secret, QR code e backup codes em texto claro apenas na resposta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.generateTwoFASecret(user.id);

      expect(result.secret).toBeDefined();
      expect(result.qrCode).toContain('data:image/png;base64');
      expect(result.backupCodes).toHaveLength(10);
      expect(result.backupCodes[0]).toMatch(
        /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/,
      );
    });

    it('deve armazenar secret pendente e backup codes como hashes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.generateTwoFASecret(user.id);
      const updateCall = mockPrisma.user.update.mock.calls[0]?.[0] as {
        data: {
          twoFactorSecret: string;
          twoFactorBackupCodes: string[];
          twoFactorPending: boolean;
        };
      };

      expect(updateCall.data.twoFactorPending).toBe(true);
      expect(updateCall.data.twoFactorSecret).toBe(result.secret);
      expect(updateCall.data.twoFactorBackupCodes).toHaveLength(10);
      expect(updateCall.data.twoFactorBackupCodes[0]).not.toBe(
        result.backupCodes[0],
      );
      expect(updateCall.data.twoFactorBackupCodes[0]).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('verifyOTP', () => {
    it('deve validar OTP TOTP correto', async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        twoFactorSecret: secret,
      });

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      const result = await service.verifyOTP(user.id, token);

      expect(result).toEqual({
        valid: true,
        message: 'OTP verified',
        usedBackupCode: false,
      });
    });

    it('deve rejeitar OTP invalido', async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        twoFactorSecret: secret,
      });

      const result = await service.verifyOTP(user.id, '000000');

      expect(result.valid).toBe(false);
      expect(result.usedBackupCode).toBe(false);
    });
  });

  describe('confirmTwoFA', () => {
    it('deve ativar 2FA apos confirmacao com OTP valido', async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        twoFactorSecret: secret,
        twoFactorPending: true,
      });
      mockPrisma.user.update.mockResolvedValue(user);

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      const success = await service.confirmTwoFA(user.id, token);

      expect(success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { twoFactor: true, twoFactorPending: false },
      });
    });

    it('deve bloquear confirmacao quando setup nao esta pendente', async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        twoFactorSecret: secret,
        twoFactorPending: false,
      });

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      const success = await service.confirmTwoFA(user.id, token);

      expect(success).toBe(false);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('disableTwoFA', () => {
    it('deve desativar 2FA com OTP valido', async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        twoFactor: true,
        twoFactorSecret: secret,
      });
      mockPrisma.user.update.mockResolvedValue(user);

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      const success = await service.disableTwoFA(user.id, token);

      expect(success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          twoFactor: false,
          twoFactorSecret: null,
          twoFactorPending: false,
          twoFactorBackupCodes: [],
        },
      });
    });

    it('deve consumir backup code valido apenas uma vez', async () => {
      const backupCode = 'ABCD-1234-EF56';
      const backupCodeHash = await bcrypt.hash(backupCode, 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        twoFactor: true,
        twoFactorSecret: 'SECRET',
        twoFactorBackupCodes: [backupCodeHash],
      });
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.verifySecondFactor(user.id, backupCode);

      expect(result.valid).toBe(true);
      expect(result.usedBackupCode).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { twoFactorBackupCodes: [] },
      });
    });
  });
});
