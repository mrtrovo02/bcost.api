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

import { XmlProcessor } from './processors/xml.processor.js';
import { DigitalCertificatesModule } from './digital-certificates/digital-certificates.module';

/**
 * FiscalModule — Motor tributário bCost
 *
 * Objetivo:
 * - Centralizar todo o domínio fiscal/tributário do bCost.
 * - Preservar integração com BullMQ, DFe, XML, notas, compliance,
 *   certificados digitais, folha, cálculo tributário e relatórios.
 * - Servir como base para o Copilot Tributário / Fiscal Intelligence.
 *
 * FIXES JÁ PRESERVADOS:
 * 1. forwardRef(() => NotificationModule) REMOVIDO.
 *    NotificationModule é @Global() — disponível automaticamente.
 *    Importar @Global() via forwardRef() pode causar deadlock no bootstrap.
 *
 * 2. PrismaService REMOVIDO dos providers.
 *    PrismaModule é @Global() — instância única para toda a aplicação.
 *
 * 3. XmlExtractionProcessor REMOVIDO dos providers.
 *    Havia múltiplos processors na mesma fila 'xml-extraction'. Isso podia
 *    criar workers simultâneos e instabilidade. Apenas XmlProcessor foi mantido.
 *
 * 4. DigitalCertificatesModule preservado.
 *    Necessário para o fluxo fiscal real: certificado A1, DFe, NF-e/NFS-e e integrações.
 *
 * 5. Exports ampliados de forma segura.
 *    Serviços fiscais principais continuam disponíveis para outros módulos SaaS:
 *    Dashboard, Insights, Automation, Finance, Business Rules e Billing futuro.
 */
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

    /**
     * Único processor ativo na fila xml-extraction.
     * Mantido para evitar duplicidade de workers BullMQ.
     */
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
    BullModule,
    DigitalCertificatesModule,
  ],
})
export class FiscalModule {}
