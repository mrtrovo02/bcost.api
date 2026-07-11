'use strict';

import { Module } from '@nestjs/common';
import { BankingService } from './banking.service.js';
import { BankingController } from './banking.controller.js';
import { ReconciliationService } from './reconciliation.service.js';
import { ImportService } from './import.service.js';

/**
 * 🏦 BankingModule - Core de Integração Bancária bCost
 * Este módulo é o coração do fluxo de caixa e reconciliação.
 * Ele deve ser independente para permitir o Advisory Contábil (Consultoria).
 */
@Module({
  // Nota: PrismaModule não é necessário aqui pois é Global no bCost Engine.
  controllers: [BankingController],
  providers: [
    BankingService,
    ReconciliationService, // 🧠 O motor que cruza Notas Fiscais com Extratos
    ImportService, // 📂 O processador de arquivos OFX/Extratos
  ],
  exports: [
    BankingService,
    ReconciliationService, // Exportamos para que o FiscalModule possa disparar automações
    ImportService, // Exportado para permitir importações via Jobs ou Triggers externos
  ],
})
export class BankingModule {}
