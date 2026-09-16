'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(private readonly prisma: PrismaService) {}

  async addToBlacklist(
    jti: string,
    userId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.tokenBlacklist.upsert({
      where: { jti },
      update: {
        userId,
        expiresAt,
      },
      create: {
        jti,
        userId,
        expiresAt,
      },
    });
  }

  async isBlacklisted(jti: string | null | undefined): Promise<boolean> {
    if (!jti) {
      return false;
    }

    const entry = await this.prisma.tokenBlacklist.findUnique({
      where: { jti },
      select: { expiresAt: true },
    });

    return Boolean(entry && entry.expiresAt > new Date());
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeExpiredTokens(): Promise<void> {
    const result = await this.prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Tokens revogados expirados removidos: ${result.count}`);
    }
  }
}
