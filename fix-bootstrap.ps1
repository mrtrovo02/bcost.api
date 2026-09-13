# =============================================================================
# fix-bootstrap.ps1 — bCost Engine
# Execute na RAIZ do projeto: .\fix-bootstrap.ps1
# Corrige TODOS os problemas de bootstrap identificados no código real.
# =============================================================================

$src = Join-Path $PSScriptRoot "src"
$ok = 0; $fail = 0

function Write-Fix($path, $content) {
    $full = Join-Path $PSScriptRoot $path
    if (-not (Test-Path $full)) {
        Write-Host "  ❌ NAO ENCONTRADO: $path" -ForegroundColor Red
        $script:fail++; return
    }
    Copy-Item $full "$full.bak" -Force
    [System.IO.File]::WriteAllText($full, $content.TrimStart("`r`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Host "  ✅ $path" -ForegroundColor Green
    $script:ok++
}

Write-Host "`n🔧 bCost Bootstrap Fix — lendo código real do projeto`n" -ForegroundColor Cyan

# =============================================================================
# FIX 1: fiscal.module.ts
# PROBLEMA: forwardRef(() => NotificationModule) — NotificationModule é @Global()
#           não precisa ser importado. forwardRef com @Global() = deadlock silencioso.
# =============================================================================
Write-Host "📄 FIX 1: fiscal.module.ts" -ForegroundColor Yellow
Write-Fix "src/modules/fiscal/fiscal.module.ts" @'
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
'@

# =============================================================================
# FIX 2: dfe.module.ts
# PROBLEMA: registra 'xml-extraction' que já está registrada no FiscalModule.
#           Fila duplicada = segundo conjunto de workers = deadlock BullMQ.
# =============================================================================
Write-Host "`n📄 FIX 2: dfe.module.ts" -ForegroundColor Yellow
Write-Fix "src/modules/fiscal/dfe/dfe.module.ts" @'
'use strict';

import { Module } from '@nestjs/common';
import { DfeService } from './dfe.service.js';

/**
 * DfeModule — Engine SEFAZ
 *
 * FIX: BullModule.registerQueue('xml-extraction') REMOVIDO.
 * A fila já é registrada e exportada pelo FiscalModule (módulo pai).
 * Registrar a mesma fila em dois módulos cria workers duplicados
 * que causam deadlock no BullMQ durante o bootstrap.
 * DfeService recebe a fila via injeção do FiscalModule.
 */
@Module({
  providers: [DfeService],
  exports: [DfeService],
})
export class DfeModule {}
'@

# =============================================================================
# FIX 3: finance.module.ts
# PROBLEMA: importa NotificationModule e PrismaModule explicitamente.
#           Ambos são @Global() — desnecessário e aumenta risco de deadlock.
# =============================================================================
Write-Host "`n📄 FIX 3: finance.module.ts" -ForegroundColor Yellow
Write-Fix "src/modules/finance/finance.module.ts" @'
'use strict';

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { FinanceProcessor } from './processors/finance.processor.js';

/**
 * FinanceModule
 *
 * FIX: NotificationModule e PrismaModule REMOVIDOS dos imports.
 * Ambos são @Global() — disponíveis automaticamente em toda a aplicação.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'finance-queue' }),
  ],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceProcessor],
  exports: [FinanceService],
})
export class FinanceModule {}
'@

# =============================================================================
# FIX 4: finance.processor.ts
# PROBLEMA: @Inject(forwardRef(() => NotificationGateway)) desnecessário.
#           NotificationModule é @Global() — injeção direta funciona.
# =============================================================================
Write-Host "`n📄 FIX 4: finance.processor.ts — remove forwardRef" -ForegroundColor Yellow
$financeProcessorPath = "src/modules/finance/processors/finance.processor.ts"
$financeProcessorFull = Join-Path $PSScriptRoot $financeProcessorPath
if (Test-Path $financeProcessorFull) {
    $content = [System.IO.File]::ReadAllText($financeProcessorFull)
    $content = $content -replace "import \{ Logger, Inject, forwardRef \} from '@nestjs/common';", "import { Logger } from '@nestjs/common';"
    $content = $content -replace "import \{ Logger, Inject \} from '@nestjs/common';", "import { Logger } from '@nestjs/common';"
    $content = $content -replace "\s*// 💡 Injeção robusta com forwardRef para quebrar o ciclo de módulos\r?\n", ""
    $content = $content -replace "\s*@Inject\(forwardRef\(\(\) => NotificationGateway\)\)\r?\n", ""
    Copy-Item $financeProcessorFull "$financeProcessorFull.bak" -Force
    [System.IO.File]::WriteAllText($financeProcessorFull, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  ✅ $financeProcessorPath" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  ❌ NAO ENCONTRADO: $financeProcessorPath" -ForegroundColor Red
    $fail++
}

# =============================================================================
# RESUMO
# =============================================================================
Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "✅ Fixes aplicados: $ok" -ForegroundColor Green
if ($fail -gt 0) {
    Write-Host "❌ Falhas: $fail (verifique se está na raiz do projeto)" -ForegroundColor Red
}
Write-Host "================================================`n" -ForegroundColor Cyan

if ($ok -gt 0) {
    Write-Host "▶️  Execute agora:" -ForegroundColor White
    Write-Host "   npm run start:dev`n" -ForegroundColor Yellow
}
