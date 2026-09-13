'use strict';

import { randomBytes } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import * as speakeasy from 'speakeasy';
import { PrismaService } from '../database/prisma.service.js';

export interface TwoFASetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface TwoFAVerifyResult {
  valid: boolean;
  message: string;
  usedBackupCode: boolean;
}

interface TwoFactorUser {
  id: string;
  email: string;
  twoFactor: boolean;
  twoFactorSecret: string | null;
  twoFactorPending: boolean;
  twoFactorBackupCodes: string[];
}

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_HASH_ROUNDS = 12;
const TOTP_WINDOW = 1;

@Injectable()
export class TwoFAService {
  constructor(private readonly prisma: PrismaService) {}

  async generateTwoFASecret(userId: string): Promise<TwoFASetupResponse> {
    const user = await this.findTwoFactorUser(userId);

    const secret = speakeasy.generateSecret({
      name: `bCost (${user.email})`,
      issuer: 'bCost',
      length: 32,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new InternalServerErrorException({
        message: 'Falha ao gerar segredo 2FA.',
        code: 'AUTH-2FA-SECRET-FAILED',
      });
    }

    const [qrCode, backupCodes] = await Promise.all([
      QRCode.toDataURL(secret.otpauth_url),
      this.generateBackupCodes(),
    ]);

    const backupCodeHashes = await Promise.all(
      backupCodes.map((code) =>
        bcrypt.hash(this.normalizeCode(code), BACKUP_CODE_HASH_ROUNDS),
      ),
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret.base32,
        twoFactorBackupCodes: backupCodeHashes,
        twoFactorPending: true,
      },
    });

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  async verifyOTP(userId: string, token: string): Promise<TwoFAVerifyResult> {
    const user = await this.findTwoFactorUser(userId);

    if (!user.twoFactorSecret) {
      return {
        valid: false,
        message: 'Two-factor not configured',
        usedBackupCode: false,
      };
    }

    if (!/^\d{6}$/.test(token)) {
      return {
        valid: false,
        message: 'Invalid OTP format',
        usedBackupCode: false,
      };
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: TOTP_WINDOW,
    });

    return {
      valid: isValid,
      message: isValid ? 'OTP verified' : 'Invalid OTP code',
      usedBackupCode: false,
    };
  }

  async verifySecondFactor(
    userId: string,
    code: string,
  ): Promise<TwoFAVerifyResult> {
    const normalizedCode = this.normalizeCode(code);

    if (/^\d{6}$/.test(normalizedCode)) {
      const otpResult = await this.verifyOTP(userId, normalizedCode);

      if (otpResult.valid) {
        return otpResult;
      }
    }

    return this.verifyAndConsumeBackupCode(userId, normalizedCode);
  }

  async confirmTwoFA(userId: string, token: string): Promise<boolean> {
    const user = await this.findTwoFactorUser(userId);

    if (!user.twoFactorPending) {
      return false;
    }

    const verification = await this.verifyOTP(userId, token);

    if (!verification.valid) {
      return false;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactor: true,
        twoFactorPending: false,
      },
    });

    return true;
  }

  async disableTwoFA(userId: string, code: string): Promise<boolean> {
    const verification = await this.verifySecondFactor(userId, code);

    if (!verification.valid) {
      return false;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactor: false,
        twoFactorSecret: null,
        twoFactorPending: false,
        twoFactorBackupCodes: [],
      },
    });

    return true;
  }

  private async findTwoFactorUser(userId: string): Promise<TwoFactorUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        twoFactor: true,
        twoFactorSecret: true,
        twoFactorPending: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        message: 'Usuário não encontrado.',
        code: 'AUTH-USER-NOT-FOUND',
      });
    }

    return user;
  }

  private async verifyAndConsumeBackupCode(
    userId: string,
    normalizedCode: string,
  ): Promise<TwoFAVerifyResult> {
    const user = await this.findTwoFactorUser(userId);

    if (!user.twoFactorBackupCodes.length) {
      return {
        valid: false,
        message: 'No backup codes available',
        usedBackupCode: false,
      };
    }

    const remainingCodes: string[] = [];
    let matched = false;

    for (const hashedCode of user.twoFactorBackupCodes) {
      if (!matched && (await bcrypt.compare(normalizedCode, hashedCode))) {
        matched = true;
        continue;
      }

      remainingCodes.push(hashedCode);
    }

    if (!matched) {
      return {
        valid: false,
        message: 'Invalid second factor code',
        usedBackupCode: false,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: remainingCodes },
    });

    return {
      valid: true,
      message: 'Backup code verified',
      usedBackupCode: true,
    };
  }

  private async generateBackupCodes(): Promise<string[]> {
    return Array.from(
      { length: BACKUP_CODE_COUNT },
      () =>
        randomBytes(6)
          .toString('hex')
          .toUpperCase()
          .match(/.{1,4}/g)
          ?.join('-') ?? randomBytes(6).toString('hex').toUpperCase(),
    );
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }
}
