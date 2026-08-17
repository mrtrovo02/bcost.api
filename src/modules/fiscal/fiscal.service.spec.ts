import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { FiscalService } from './fiscal.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('FiscalService (Motor Tributário)', () => {
  let service: FiscalService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalService,
        {
          provide: PrismaService,
          useValue: {
            payroll: { findMany: jest.fn() },
            extended: {
              invoice: { findMany: jest.fn() },
              company: { findUnique: jest.fn() },
            },
          },
        },
        {
          provide: getQueueToken('xml-extraction'),
          useValue: {
            client: Promise.resolve({ ping: jest.fn() }),
            addBulk: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FiscalService>(FiscalService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve realizar o cálculo do Fator R com sucesso', async () => {
    // Mocks baseados no seu Schema
    (prisma.extended.invoice.findMany as jest.Mock).mockResolvedValue([
      { amount: new Prisma.Decimal(10000) },
    ]);
    (prisma.payroll.findMany as jest.Mock).mockResolvedValue([
      { totalAmount: new Prisma.Decimal(2800) },
    ]);

    const result = await service.calculateMonthlyTax('company-id', 4, 2026);

    expect(result.metrics.fatorR).toBe(28);
    expect(result.metrics.anexoUtilizado).toBe('III');
  });

  it('exporta invoices fiscais em CSV para integracao contábil', async () => {
    (prisma.extended.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-id',
      cnpj: '12345678000190',
      name: 'Empresa Real Ltda',
      taxRegime: 'SIMPLES_NACIONAL',
      active: true,
      deletedAt: null,
    });
    (prisma.extended.invoice.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'invoice-1',
        number: '123',
        serie: '1',
        type: 'SERVICE',
        status: 'NORMAL',
        issuedAt: new Date('2026-01-15T12:00:00.000Z'),
        accessKey: 'NFE123',
        amount: new Prisma.Decimal(1500.5),
        taxAmount: new Prisma.Decimal(90.03),
        reconciled: true,
        customer: {
          document: '11122233000144',
          name: 'Cliente Final',
        },
      },
    ]);

    const file = await service.exportCompanyInvoices('company-id', 'DOMINIO');
    const csv = file.content.toString('utf-8');

    expect(file.filename).toContain('bcost-fiscal-dominio-12345678000190');
    expect(file.mimeType).toBe('text/csv; charset=utf-8');
    expect(file.records).toBe(1);
    expect(csv).toContain('layout;company_id;company_cnpj');
    expect(csv).toContain(
      'DOMINIO;company-id;12345678000190;Empresa Real Ltda',
    );
    expect(csv).toContain('invoice-1;123;1;SERVICE;NORMAL');
    expect(csv).toContain('11122233000144;Cliente Final;1500.50;90.03;true');
  });

  it('bloqueia formato de exportacao fiscal desconhecido', async () => {
    await expect(
      service.exportCompanyInvoices('company-id', 'LAYOUT_DESCONHECIDO'),
    ).rejects.toThrow(BadRequestException);
  });

  it('bloqueia exportacao fiscal de empresa inativa ou removida', async () => {
    (prisma.extended.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-id',
      active: false,
      deletedAt: null,
    });

    await expect(
      service.exportCompanyInvoices('company-id', 'ALTERDATA'),
    ).rejects.toThrow(NotFoundException);
  });
});
