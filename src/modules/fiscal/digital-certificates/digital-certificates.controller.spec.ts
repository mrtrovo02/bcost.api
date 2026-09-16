import { Test, TestingModule } from '@nestjs/testing';
import { DigitalCertificatesController } from './digital-certificates.controller';
import { DigitalCertificatesService } from './digital-certificates.service';
import { PrismaService } from '../../../database/prisma.service.js';

describe('DigitalCertificatesController', () => {
  let controller: DigitalCertificatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DigitalCertificatesController],
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

    controller = module.get<DigitalCertificatesController>(
      DigitalCertificatesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
