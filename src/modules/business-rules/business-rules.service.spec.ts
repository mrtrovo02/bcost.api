import { Test, TestingModule } from '@nestjs/testing';
import { BusinessRulesService } from './business-rules.service';
import { PrismaService } from '../../database/prisma.service.js';
import { jest } from '@jest/globals';

describe('BusinessRulesService', () => {
  let service: BusinessRulesService;
  let businessRuleFindMany: jest.Mock;

  beforeEach(async () => {
    businessRuleFindMany = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessRulesService,
        {
          provide: PrismaService,
          useValue: {
            businessRule: {
              findMany: businessRuleFindMany,
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BusinessRulesService>(BusinessRulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('limits list queries by company to protect production scale', async () => {
    businessRuleFindMany.mockResolvedValue([]);

    await service.findAll('company-001');

    expect(businessRuleFindMany).toHaveBeenCalledWith({
      where: { companyId: 'company-001' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });
});
