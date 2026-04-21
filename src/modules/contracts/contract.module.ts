'use strict';

import { Module } from '@nestjs/common';
import { ContractService } from './contract.service.js';
import { PrismaModule } from '../../database/prisma.module.js';

/**
 * ContractModule: Gestor de Acordos Comerciais.
 * Responsável por armazenar as regras de faturamento recorrente de cada cliente.
 */
@Module({
  imports: [PrismaModule],
  providers: [ContractService],
  controllers: [], // Pode ser adicionado um ContractController futuramente
  exports: [ContractService],
})
export class ContractModule {}
