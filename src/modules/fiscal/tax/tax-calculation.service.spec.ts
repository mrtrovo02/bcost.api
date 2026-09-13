'use strict';

import { Prisma, TaxRegime } from '@prisma/client';
import { TaxCalculationService } from './tax-calculation.service.js';

describe('TaxCalculationService', () => {
  const buildService = () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          taxRegime: TaxRegime.SIMPLES_NACIONAL,
          anexo: 5,
          name: 'Empresa Teste',
        }),
      },
      invoice: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _sum: { amount: new Prisma.Decimal(120000) },
          })
          .mockResolvedValueOnce({
            _sum: { amount: new Prisma.Decimal(10000) },
          }),
      },
      payroll: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: new Prisma.Decimal(40000) },
        }),
      },
      taxObligation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'obligation-1' }),
      },
      taxCalculation: {
        upsert: jest.fn().mockResolvedValue({ id: 'calc-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      withRlsCompanyContext: jest
        .fn()
        .mockImplementation(async (_companyId, callback) => callback(prisma)),
    };

    return {
      service: new TaxCalculationService(prisma as never),
      prisma,
    };
  };

  it('bloqueia fechamento oficial quando faltam certificado, portal e revisão CRC', async () => {
    const { service } = buildService();

    const preview = await service.previewMonthlyClosure(
      'company-1',
      7,
      2026,
      'user-1',
      {
        hasRevenueReconciliation: true,
      },
    );

    expect(preview.status).toBe('BLOCKED');
    expect(preview.canClose).toBe(false);
    expect(preview.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DIGITAL_CERTIFICATE',
          status: 'FAIL',
        }),
        expect.objectContaining({
          code: 'OFFICIAL_PORTAL_ACCESS',
          status: 'FAIL',
        }),
        expect.objectContaining({ code: 'CRC_REVIEW', status: 'FAIL' }),
      ]),
    );
    expect(preview.nextActions.length).toBeGreaterThan(0);
    expect(preview.evidencePacket.closureProtocol).toMatch(
      /^BCOST-TAX-2026-07-[A-F0-9]{12}$/,
    );
    expect(preview.evidencePacket.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.evidencePacket.requiredArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CERTIFICADO_PROCURACAO',
          status: 'MISSING',
        }),
        expect.objectContaining({
          code: 'REVISAO_CRC',
          status: 'MISSING',
        }),
        expect.objectContaining({
          code: 'ACESSO_PORTAL_SIMPLES',
          status: 'MISSING',
        }),
      ]),
    );
  });

  it('libera fechamento quando gates oficiais estão atendidos', async () => {
    const { service } = buildService();

    const preview = await service.previewMonthlyClosure(
      'company-1',
      7,
      2026,
      'user-1',
      {
        hasDigitalCertificate: true,
        hasCrcReview: true,
        hasOfficialPortalAccess: true,
        hasRevenueReconciliation: true,
      },
    );

    expect(preview.status).toBe('READY_TO_CLOSE');
    expect(preview.canClose).toBe(true);
    expect(preview.calculation.appliedAnexo).toBe(3);
    expect(preview.evidenceRequired).toEqual(
      expect.arrayContaining(['Recibo PGDAS-D e guia DAS após fechamento']),
    );
    expect(preview.evidencePacket.requiredArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CERTIFICADO_PROCURACAO',
          status: 'READY',
        }),
        expect.objectContaining({ code: 'REVISAO_CRC', status: 'READY' }),
        expect.objectContaining({
          code: 'ACESSO_PORTAL_SIMPLES',
          status: 'READY',
        }),
        expect.objectContaining({ code: 'RECIBO_PGDAS_D', status: 'PENDING' }),
        expect.objectContaining({ code: 'GUIA_DAS', status: 'PENDING' }),
      ]),
    );
  });

  it('impede geração da obrigação quando o fechamento oficial não atende gates', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.closeMonthAndGenerateObligation('company-1', 7, 2026, 'user-1', {
        hasRevenueReconciliation: true,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        status: 'BLOCKED',
      }),
    });
    expect(prisma.taxObligation.create).not.toHaveBeenCalled();
  });

  it('gera obrigação quando gates oficiais estão atendidos', async () => {
    const { service, prisma } = buildService();

    const closure = await service.closeMonthAndGenerateObligation(
      'company-1',
      7,
      2026,
      'user-1',
      {
        hasDigitalCertificate: true,
        hasCrcReview: true,
        hasOfficialPortalAccess: true,
        hasRevenueReconciliation: true,
      },
    );

    expect(closure.obligation).toEqual({ id: 'obligation-1' });
    expect(closure.auditTrail).toEqual(
      expect.objectContaining({
        closureProtocol: expect.stringMatching(
          /^BCOST-TAX-2026-07-[A-F0-9]{12}$/,
        ),
        evidencePacketId: 'tax-preview:company-1:2026-07',
        integrityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        period: '2026-07',
      }),
    );
    expect(closure.officialEvidence.pendingArtifacts).toEqual([
      'RECIBO_PGDAS_D',
      'GUIA_DAS',
    ]);
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(prisma.taxCalculation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          inputSnapshot: expect.objectContaining({
            evidencePacket: expect.objectContaining({
              closureProtocol: expect.stringMatching(
                /^BCOST-TAX-2026-07-[A-F0-9]{12}$/,
              ),
              integrityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
            auditTrail: expect.objectContaining({
              period: '2026-07',
            }),
            officialEvidence: expect.objectContaining({
              status: 'AWAITING_GOVERNMENT_RECEIPTS',
              pendingArtifacts: ['RECIBO_PGDAS_D', 'GUIA_DAS'],
            }),
          }),
        }),
      }),
    );
  });
});
