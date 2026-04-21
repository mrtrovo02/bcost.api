'use strict';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { TransactionType } from '@prisma/client';
// Importação direta da função parse para reduzir uso de any
import { parse } from 'ofx-js';
import {
  OfxData,
  OfxTransaction,
  normalizeOfxTransactions,
} from './types/ofx.js';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * Importa e processa extratos bancários (OFX).
   * @param companyId ID da empresa dona do extrato
   * @param bankAccountId ID da conta bancária de destino
   * @param fileBuffer Buffer do arquivo enviado via Multipart
   */
  async importOfx(
    companyId: string,
    bankAccountId: string,
    fileBuffer: Buffer,
  ) {
    this.logger.log(
      `[Import] Iniciando processamento OFX | Company: ${companyId}`,
    );

    try {
      const rawData = fileBuffer.toString('utf-8');
      const ofxData = this.parseOfx(rawData);

      const stmtrs = ofxData?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS;
      const transactions = normalizeOfxTransactions(stmtrs);

      let importedCount = 0;

      for (const tx of transactions) {
        const normalized = this.normalizeTransaction(tx);
        const amount = Number(normalized.amount);
        const fitid = normalized.fitid; // ID único da transação no banco

        // Verifica se esta transação já foi importada anteriormente (Idempotência)
        const alreadyExists =
          await this.prisma.extended.bankTransaction.findFirst({
            where: {
              companyId,
              bankAccountId,
              metadata: {
                path: ['fitid'],
                equals: fitid,
              },
            },
          });

        if (alreadyExists) continue;

        await this.prisma.extended.bankTransaction.create({
          data: {
            companyId,
            bankAccountId,
            amount: Math.abs(amount),
            type: amount > 0 ? TransactionType.CREDIT : TransactionType.DEBIT,
            description: normalized.description,
            occurredAt: this.parseOfxDate(normalized.postedAt),
            reconciled: false,
            metadata: {
              fitid: fitid,
              bank_type: normalized.type,
            },
          },
        });

        importedCount++;
      }

      this.logger.log(`[Import] Sucesso: ${importedCount} novas transações.`);

      // Dispara o Auto-Match imediatamente após a importação
      const autoMatchResults =
        await this.reconciliation.runAutoMatch(companyId);

      return {
        status: 'SUCCESS',
        imported: importedCount,
        reconciled: autoMatchResults.reconciled,
        accuracy: autoMatchResults.accuracy,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Import Error] Falha ao processar OFX: ${message}`);
      throw new BadRequestException('Arquivo OFX inválido ou corrompido.');
    }
  }

  /**
   * Converte o formato de data OFX (ex: 20231025120000) para Date
   */
  private parseOfxDate(ofxDate: string): Date {
    // Pega os primeiros 8 caracteres: YYYYMMDD
    const year = parseInt(ofxDate.substring(0, 4));
    const month = parseInt(ofxDate.substring(4, 6)) - 1;
    const day = parseInt(ofxDate.substring(6, 8));
    return new Date(year, month, day);
  }

  private parseOfx(rawData: string): OfxData {
    const parseOfx = parse as (input: string) => unknown;
    const parsed = parseOfx(rawData);
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('Arquivo OFX inválido ou incompleto.');
    }
    return parsed as OfxData;
  }

  private normalizeTransaction(trn: OfxTransaction): {
    fitid: string;
    amount: string | number;
    postedAt: string;
    description: string;
    type?: string;
  } {
    if (!trn.FITID || trn.TRNAMT === undefined || !trn.DTPOSTED) {
      throw new BadRequestException('Transação OFX inválida ou incompleta.');
    }

    return {
      fitid: trn.FITID,
      amount: trn.TRNAMT,
      postedAt: trn.DTPOSTED,
      description: trn.MEMO || trn.NAME || 'Transação Bancária',
      type: trn.TRNTYPE,
    };
  }
}
