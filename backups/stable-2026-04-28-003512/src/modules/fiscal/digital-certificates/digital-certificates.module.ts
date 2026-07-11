'use strict';

import { Module } from '@nestjs/common';
import { DigitalCertificatesService } from './digital-certificates.service.js';
import { DigitalCertificatesController } from './digital-certificates.controller.js';

@Module({
  controllers: [DigitalCertificatesController],
  providers: [DigitalCertificatesService],
  exports: [DigitalCertificatesService],
})
export class DigitalCertificatesModule {}
