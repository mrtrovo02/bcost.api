import { Test, TestingModule } from '@nestjs/testing';
import { DigitalCertificatesController } from './digital-certificates.controller';
import { DigitalCertificatesService } from './digital-certificates.service';

describe('DigitalCertificatesController', () => {
  let controller: DigitalCertificatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DigitalCertificatesController],
      providers: [DigitalCertificatesService],
    }).compile();

    controller = module.get<DigitalCertificatesController>(DigitalCertificatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
