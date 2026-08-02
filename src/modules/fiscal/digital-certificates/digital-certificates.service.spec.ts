import { Test, TestingModule } from '@nestjs/testing';
import { DigitalCertificatesService } from './digital-certificates.service';
import { PrismaService } from '../../../database/prisma.service.js';

describe('DigitalCertificatesService', () => {
  let service: DigitalCertificatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalCertificatesService,
        {
          provide: PrismaService,
          useValue: {
            digitalCertificate: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DigitalCertificatesService>(DigitalCertificatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
