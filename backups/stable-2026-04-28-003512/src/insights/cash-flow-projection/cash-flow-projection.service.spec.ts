import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { CashFlowProjectionService } from './cash-flow-projection.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('CashFlowProjectionService', () => {
  let service: CashFlowProjectionService;
  let prismaService: PrismaService;

  // Mock do PrismaService
  const mockPrismaService = {
    bankTransaction: {
      findMany: jest.fn(),
    },
    cashFlowProjection: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashFlowProjectionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CashFlowProjectionService>(CashFlowProjectionService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Aqui você pode adicionar mais testes específicos
  // Exemplo:
  // describe('generateProjection', () => {
  //   it('should return projection when transactions exist', async () => {
  //     const mockTransactions = [...];
  //     mockPrismaService.bankTransaction.findMany.mockResolvedValue(mockTransactions);
  //     const result = await service.generateProjection('company-id', 90);
  //     expect(result).toBeDefined();
  //   });
  // });
});
