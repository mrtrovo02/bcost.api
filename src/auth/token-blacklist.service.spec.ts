'use strict';

import { PrismaService } from '../database/prisma.service.js';
import { TokenBlacklistService } from './token-blacklist.service.js';

interface MockTokenBlacklistDelegate {
  upsert: jest.Mock;
  findUnique: jest.Mock;
  deleteMany: jest.Mock;
}

interface MockPrismaService {
  tokenBlacklist: MockTokenBlacklistDelegate;
}

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let mockPrisma: MockPrismaService;

  beforeEach(() => {
    mockPrisma = {
      tokenBlacklist: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    service = new TokenBlacklistService(mockPrisma as unknown as PrismaService);
  });

  it('deve adicionar token a blacklist de forma idempotente', async () => {
    const jti = 'jti-123';
    const userId = 'user-123';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    mockPrisma.tokenBlacklist.upsert.mockResolvedValue({
      id: 'blacklist-001',
      jti,
      userId,
      expiresAt,
    });

    await service.addToBlacklist(jti, userId, expiresAt);

    expect(mockPrisma.tokenBlacklist.upsert).toHaveBeenCalledWith({
      where: { jti },
      update: { userId, expiresAt },
      create: { jti, userId, expiresAt },
    });
  });

  it('deve retornar true para token revogado e ainda nao expirado', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 1000),
    });

    await expect(service.isBlacklisted('jti-active')).resolves.toBe(true);
  });

  it('deve retornar false para token desconhecido ou expirado', async () => {
    mockPrisma.tokenBlacklist.findUnique.mockResolvedValueOnce(null);
    await expect(service.isBlacklisted('jti-unknown')).resolves.toBe(false);

    mockPrisma.tokenBlacklist.findUnique.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.isBlacklisted('jti-expired')).resolves.toBe(false);

    await expect(service.isBlacklisted(undefined)).resolves.toBe(false);
  });

  it('deve limpar tokens expirados no scheduler diario', async () => {
    mockPrisma.tokenBlacklist.deleteMany.mockResolvedValue({ count: 3 });

    await service.purgeExpiredTokens();

    expect(mockPrisma.tokenBlacklist.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
