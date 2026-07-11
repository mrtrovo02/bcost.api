import { Test, TestingModule } from '@nestjs/testing';
import { FiscalService } from './fiscal.service.js';
import { PrismaService } from '../../database/prisma.service.js';

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
            payroll: { aggregate: jest.fn() },
            invoice: { aggregate: jest.fn() },
            taxCalculation: { upsert: jest.fn() },
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
    (prisma.payroll.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 2800 } });
    (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 10000 } });
    (prisma.taxCalculation.upsert as jest.Mock).mockResolvedValue({ id: '1', fatorR: 0.28 });

    const result = await service.calculateFatorR('company-id', 4, 2026);
    
    expect(result).toBe(0.28);
    expect(prisma.taxCalculation.upsert).toHaveBeenCalled();
  });
});
