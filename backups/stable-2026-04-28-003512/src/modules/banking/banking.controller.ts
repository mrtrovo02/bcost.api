'use strict';

import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BankingService } from './banking.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { ImportService } from './import.service.js';

/**
 * 🏦 BankingController - API de Operações Bancárias bCost
 */
@Controller('banking')
export class BankingController {
  constructor(
    private readonly bankingService: BankingService,
    private readonly reconciliationService: ReconciliationService,
    private readonly importService: ImportService, // 📂 Adicionado para processar OFX
  ) {}

  /**
   * 📤 IMPORTAÇÃO DE EXTRATO (OFX)
   * Recebe o arquivo, extrai transações e dispara a conciliação automática.
   */
  @Post('import/:companyId/:bankAccountId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadOfx(
    @Param('companyId') companyId: string,
    @Param('bankAccountId') bankAccountId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('O arquivo OFX é obrigatório.');
    }

    // Agora delegamos ao ImportService, que é o especialista em arquivos
    return await this.importService.importOfx(
      companyId,
      bankAccountId,
      file.buffer,
    );
  }

  /**
   * ⚙️ GATILHO DE CONCILIAÇÃO MANUAL
   * Força o motor de auto-match a varrer transações e notas pendentes.
   */
  @Post('reconcile/:companyId')
  async triggerReconciliation(@Param('companyId') companyId: string) {
    return await this.reconciliationService.runAutoMatch(companyId);
  }

  /**
   * ⏪ DESFAZER CONCILIAÇÃO
   * Útil para correções do usuário quando o auto-match erra (raro, mas previsto).
   */
  @Post('unmatch/:transactionId')
  async undoMatch(
    @Param('transactionId') transactionId: string,
    // Em produção, o userId viria do @GetUser() decorado pelo JWT
  ) {
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    return await this.reconciliationService.undoMatch(
      transactionId,
      SYSTEM_USER_ID,
    );
  }
}
