'use strict';

import { ForbiddenException } from '@nestjs/common';
import { ObligationStatus } from '@prisma/client';
import { ObligationsEnterpriseService } from './obligations-enterprise.service.js';

describe('ObligationsEnterpriseService', () => {
  const baseObligation = {
    id: 'obligation-1',
    companyId: 'company-1',
    name: 'Guia DAS - Simples Nacional - 2026-07',
    dueDate: new Date('2026-08-20T00:00:00.000Z'),
    amount: 1200,
    status: ObligationStatus.PENDING,
    fileUrl: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    version: 1,
  };

  const buildService = () => {
    const taxObligation = {
      findFirst: jest.fn().mockResolvedValue(baseObligation),
      update: jest.fn().mockResolvedValue({
        ...baseObligation,
        fileUrl: 'https://portal.gov.br/pgdasd/recibo-123.pdf',
        version: 2,
      }),
    };
    const auditLog = {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const prisma = {
      taxObligation,
      auditLog,
    };

    return {
      service: new ObligationsEnterpriseService(prisma as never),
      prisma,
    };
  };

  it('registra evidencia oficial com hash e audit log', async () => {
    const { service, prisma } = buildService();

    const result = await service.registerTaxEvidence(
      'company-1',
      'obligation-1',
      {
        fileUrl: 'https://portal.gov.br/pgdasd/recibo-123.pdf',
        receiptCode: 'PGDASD-2026-000123',
        notes: 'Recibo oficial conferido no Portal do Simples Nacional.',
      },
      {
        id: 'user-1',
        companyId: 'company-1',
        role: 'ACCOUNTANT',
      },
    );

    expect(prisma.taxObligation.update).toHaveBeenCalledWith({
      where: { id: 'obligation-1' },
      data: {
        fileUrl: 'https://portal.gov.br/pgdasd/recibo-123.pdf',
        version: { increment: 1 },
      },
    });
    expect(result.evidence.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.item).toEqual(
      expect.objectContaining({
        id: 'obligation-1',
        fileUrl: 'https://portal.gov.br/pgdasd/recibo-123.pdf',
        version: 2,
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          userId: 'user-1',
          action: 'TAX_OBLIGATION_OFFICIAL_EVIDENCE_REGISTERED',
          entity: 'TaxObligation',
          entityId: 'obligation-1',
          payload: expect.objectContaining({
            evidence: expect.objectContaining({
              receiptCode: 'PGDASD-2026-000123',
              source: 'GOVERNMENT_PORTAL',
              integrityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          }),
        }),
      }),
    );
  });

  it('bloqueia registro de evidencia para empresa fora do tenant', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.registerTaxEvidence(
        'company-1',
        'obligation-1',
        {
          fileUrl: 'https://portal.gov.br/pgdasd/recibo-123.pdf',
          receiptCode: 'PGDASD-2026-000123',
        },
        {
          id: 'user-2',
          companyId: 'company-2',
          role: 'ACCOUNTANT',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.taxObligation.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
