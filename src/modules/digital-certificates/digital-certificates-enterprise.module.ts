'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { DigitalCertificatesEnterpriseController } from './digital-certificates-enterprise.controller.js';
import { DigitalCertificatesEnterpriseService } from './digital-certificates-enterprise.service.js';

/**
 * DigitalCertificatesEnterpriseModule
 *
 * FASE 3.5.1:
 * - Módulo operacional de certificados digitais.
 * - Não armazena PFX/senha porque o schema atual não possui esses campos.
 * - Opera metadata, validade, status, resumo e auditoria.
 * - Base para automação fiscal real futura com Receita/SEFAZ.
 */
@Module({
  imports: [PrismaModule],
  controllers: [DigitalCertificatesEnterpriseController],
  providers: [DigitalCertificatesEnterpriseService],
  exports: [DigitalCertificatesEnterpriseService],
})
export class DigitalCertificatesEnterpriseModule {}
