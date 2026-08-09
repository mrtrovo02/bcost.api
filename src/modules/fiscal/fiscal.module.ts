'use strict';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { FiscalController } from './fiscal.controller';
import { TaxController } from './tax/tax.controller';
import { PayrollController } from './payroll/payroll.controller';
import { FiscalCompatibilityController } from './fiscal-compatibility.controller';

import { FiscalService } from './fiscal.service';
import { TaxService } from './tax/tax.service';
import { TaxCalculationService } from './tax/tax-calculation.service';
import { PayrollService } from './payroll/payroll.service';
import { XmlService } from './xml/xml.service';
import { InvoiceService } from './invoices/invoice.service';
import { ComplianceService } from './compliance/compliance.service';
import { FiscalSeedService } from './seed/fiscal-seed.service';
import { DfeService } from './dfe/dfe.service';
import { DfeProcessorService } from './dfe/dfe-processor.service';
import { FiscalCronService } from './fiscal-cron.service';
import { ReportService } from './reports/report.service';
import { CbsIbsEngineService } from './services/cbs-ibs-engine.service';
import { TaxReformXmlService } from './services/tax-reform-xml.service';
import { TaxRegimeSimulatorService } from './services/tax-regime-simulator.service';
import { SefazProtocolService } from './dfe/sefaz-protocol.service';

import { XmlProcessor } from './processors/xml.processor';
import { DigitalCertificatesModule } from './digital-certificates/digital-certificates.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'xml-extraction',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2_000,
        },
        removeOnComplete: {
          age: 3_600,
        },
        removeOnFail: false,
      },
    }),

    DigitalCertificatesModule,
  ],

  controllers: [
    FiscalController,
    TaxController,
    PayrollController,
    FiscalCompatibilityController,
  ],

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
    CbsIbsEngineService,
    TaxReformXmlService,
    TaxRegimeSimulatorService,
    SefazProtocolService,

    XmlProcessor,
  ],

  exports: [
    FiscalService,
    TaxService,
    TaxCalculationService,
    PayrollService,
    XmlService,
    ComplianceService,
    InvoiceService,
    FiscalSeedService,
    ReportService,
    DfeService,
    DfeProcessorService,
    CbsIbsEngineService,
    TaxReformXmlService,
    TaxRegimeSimulatorService,
    SefazProtocolService,
    BullModule,
    DigitalCertificatesModule,
  ],
})
export class FiscalModule {}
