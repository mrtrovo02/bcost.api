'use strict';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { FiscalController } from './fiscal.controller.js';
import { TaxController } from './tax/tax.controller.js';
import { PayrollController } from './payroll/payroll.controller.js';

import { FiscalService } from './fiscal.service.js';
import { TaxService } from './tax/tax.service.js';
import { TaxCalculationService } from './tax/tax-calculation.service.js';
import { PayrollService } from './payroll/payroll.service.js';
import { XmlService } from './xml/xml.service.js';
import { InvoiceService } from './invoices/invoice.service.js';
import { ComplianceService } from './compliance/compliance.service.js';
import { FiscalSeedService } from './seed/fiscal-seed.service.js';
import { DfeService } from './dfe/dfe.service.js';
import { DfeProcessorService } from './dfe/dfe-processor.service.js';
import { FiscalCronService } from './fiscal-cron.service.js';
import { ReportService } from './reports/report.service.js';

/**
 * FiscalModule — Motor tributário bCost
 *
 * FIXES APLICADOS:
 * 1. forwardRef(() => NotificationModule) REMOVIDO.
 *    NotificationModule é @Global() — disponível automaticamente.
 *    Importar @Global() via forwardRef() causa deadlock no bootstrap.
 *
 * 2. PrismaService REMOVIDO dos providers.
 *    PrismaModule é @Global() — instância única para toda a aplicação.
 *
 * 3. XmlExtractionProcessor REMOVIDO dos providers.
 *    Havia 5 processors na mesma fila 'xml-extraction' — o BullMQ
 *    tentava criar 5 workers simultâneos, causando deadlock na inicialização.
 *    Apenas XmlProcessor (o mais completo) foi mantido.
 */
import { XmlProcessor } from './processors/xml.processor.js';
import { DigitalCertificatesModule } from './digital-certificates/digital-certificates.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'xml-extraction',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 3_600 },
        removeOnFail: false,
      },
    }),
    DigitalCertificatesModule,
  ],

  controllers: [FiscalController, TaxController, PayrollController],

  providers: [
    FiscalService,
    TaxService,
    TaxCalculationService,
    PayrollService,
    XmlService,
    InvoiceService,
    ComplianceService,
    FiscalCronService,
    FiscalSeedService,
    DfeService,
    DfeProcessorService,
    ReportService,
    XmlProcessor, // único processor ativo na fila xml-extraction
  ],

  exports: [
    FiscalService,
    TaxService,
    TaxCalculationService,
    PayrollService,
    ComplianceService,
    InvoiceService,
    ReportService,
    DfeService,
    BullModule,
  ],
})
export class FiscalModule {}
