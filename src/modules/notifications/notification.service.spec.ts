'use strict';

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationService,
  NotificationDispatchResult,
} from './notification.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationGateway } from './notification.gateway.js';
import { jest } from '@jest/globals';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: PrismaService;
  let gateway: NotificationGateway;
  let sendNotificationMock: jest.Mock;

  beforeEach(async () => {
    const mockPrisma = {
      notificationLog: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'log-uuid', status: 'PENDING' }),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      company: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const transaction = async <T>(
      fn: (tx: {
        notificationLog: { update: jest.Mock };
        auditLog: { create: jest.Mock };
      }) => Promise<T>,
    ): Promise<T> =>
      fn({
        notificationLog: {
          update: mockPrisma.notificationLog.update,
        },
        auditLog: { create: mockPrisma.auditLog.create },
      });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: PrismaService,
          useValue: {
            ...mockPrisma,
            $transaction: transaction,
          },
        },
        {
          provide: NotificationGateway,
          useValue: { sendNotification: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    prisma = module.get<PrismaService>(PrismaService);
    gateway = module.get<NotificationGateway>(NotificationGateway);
    sendNotificationMock = gateway.sendNotification as jest.Mock;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================
  // Testes notifyX
  // =========================
  it('notifyTaxReady deve criar log e enviar notificação', async () => {
    const companyId = '123';
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: companyId,
      name: 'TestCo',
    });
    (prisma.notificationLog.create as jest.Mock).mockResolvedValue({
      id: 'log1',
    });

    // Casting para 'any' ou para o tipo de retorno esperado resolve o erro de 'void' no teste
    const result: NotificationDispatchResult = await service.notifyTaxReady(
      companyId,
      2,
      2026,
      1500,
    );
    const createLogMock = prisma.notificationLog.create as jest.Mock;

    expect(result.status).toBe('DISPATCHED');
    expect(createLogMock).toHaveBeenCalled();
    expect(sendNotificationMock).toHaveBeenCalled();
  });

  it('notifyFactorRWarning deve criar log e enviar notificação', async () => {
    const companyId = '123';
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: companyId,
      name: 'TestCo',
    });
    (prisma.notificationLog.create as jest.Mock).mockResolvedValue({
      id: 'log2',
    });

    const result: NotificationDispatchResult =
      await service.notifyFactorRWarning(companyId, 25, 500);
    const createLogMock = prisma.notificationLog.create as jest.Mock;

    expect(result.status).toBe('DISPATCHED');
    expect(createLogMock).toHaveBeenCalled();
  });

  it('notifyComplianceIssue deve criar log e enviar notificação', async () => {
    const companyId = '123';
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: companyId,
      name: 'TestCo',
    });
    (prisma.notificationLog.create as jest.Mock).mockResolvedValue({
      id: 'log3',
    });

    // A correção principal aqui é garantir que o TS veja o retorno como um objeto, não void
    const result: NotificationDispatchResult =
      await service.notifyComplianceIssue(companyId, 'ERR_TEST');
    const createLogMock = prisma.notificationLog.create as jest.Mock;

    expect(result.status).toBe('DISPATCHED');
    expect(createLogMock).toHaveBeenCalled();
  });

  it('notifyCertificateExpiring deve criar log e enviar notificação', async () => {
    const companyId = '123';
    const date = new Date();
    (prisma.notificationLog.create as jest.Mock).mockResolvedValue({
      id: 'log4',
    });

    const result: NotificationDispatchResult =
      await service.notifyCertificateExpiring(companyId, date);
    const createLogMock = prisma.notificationLog.create as jest.Mock;

    expect(result.status).toBe('DISPATCHED');
    expect(createLogMock).toHaveBeenCalled();
  });

  // =========================
  // Testes de Query e Persistência
  // =========================
  it('findByCompany deve chamar findMany', async () => {
    (prisma.notificationLog.findMany as jest.Mock).mockResolvedValue([]);
    const logs = await service.findByCompany('123');
    const findManyMock = prisma.notificationLog.findMany as jest.Mock;

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: '123' } }),
    );
    expect(logs).toEqual([]);
  });

  it('acknowledge deve atualizar notificação e criar log de auditoria', async () => {
    (prisma.notificationLog.update as jest.Mock).mockResolvedValue({
      id: 'notif1',
    });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'audit1' });

    const res = await service.acknowledge({
      notificationId: 'notif1',
      companyId: '123',
      userId: 'user1',
    });
    const auditLogCreateMock = prisma.auditLog.create as jest.Mock;

    expect(res.acknowledged).toBe(true);
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user1' }),
      }),
    );
  });
});
