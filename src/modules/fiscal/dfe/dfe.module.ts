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
