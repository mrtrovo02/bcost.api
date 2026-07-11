import { Test, TestingModule } from '@nestjs/testing';
import { BusinessRulesService } from './business-rules.service';
import { PrismaService } from '../../database/prisma.service.js';
import { jest } from '@jest/globals';

describe('BusinessRulesService', () => {
  let service: BusinessRulesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessRulesService,
        {
          provide: PrismaService,
          useValue: {
            businessRule: {
              findMany: jest.fn(),
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
});
