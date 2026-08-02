import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { FiscalService } from './fiscal.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '@prisma/client';

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
});
