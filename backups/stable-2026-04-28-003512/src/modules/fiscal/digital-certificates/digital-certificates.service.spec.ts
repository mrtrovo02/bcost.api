import { Test, TestingModule } from '@nestjs/testing';
import { DigitalCertificatesService } from './digital-certificates.service';

describe('DigitalCertificatesService', () => {
  let service: DigitalCertificatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DigitalCertificatesService],
    }).compile();

    service = module.get<DigitalCertificatesService>(DigitalCertificatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
