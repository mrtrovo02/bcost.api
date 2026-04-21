import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PrismaService } from '../../database/prisma.service.js';
import { jest } from '@jest/globals';

describe('AnomalyDetectionService', () => {
  let service: AnomalyDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyDetectionService,
        {
          provide: PrismaService,
          useValue: {
            bankTransaction: { findMany: jest.fn().mockResolvedValue([]) },
            invoice: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get<AnomalyDetectionService>(AnomalyDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
