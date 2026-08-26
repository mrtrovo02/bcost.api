'use strict';

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  ContractStatus,
  InvoiceType,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';

/**
 * Interfaces para o resultado do ciclo de faturamento.
 */
export interface BillingDetail {
  contractId: string;
  invoiceId: string;
}

export interface BillingCycleResult {
  processed: number;
  successful: number;
  details: BillingDetail[];
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * CRIAÇÃO DE CONTRATO
   * Valida regras de negócio e vinculação com cliente.
   */
  async create(companyId: string, data: Prisma.ContractUncheckedCreateInput) {
    const billingDay = data.billingDay ?? 5;

    if (billingDay < 1 || billingDay > 28) {
      throw new BadRequestException(
        'O dia de faturamento deve ser entre 1 e 28.',
      );
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, companyId },
    });

    if (!customer)
      throw new NotFoundException('Cliente não encontrado para esta empresa.');

    return this.prisma.contract.create({
      data: {
        ...data,
        companyId,
        billingDay,
      },
    });
  }

  /**
   * MOTOR DE FATURAMENTO (Billing Engine)
   * Varre contratos ativos e gera faturas automaticamente.
   * Compatível com Schema: utiliza 'amount', 'issuedAt' e 'reconciled'.
   */
  async runBillingCycle(
    companyId: string,
    userId: string,
  ): Promise<BillingCycleResult> {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Busca contratos ativos que devem ser faturados hoje
    const pendingContracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        status: ContractStatus.ACTIVE,
        billingDay: dayOfMonth,
        OR: [
          { lastBillingAt: null },
          { lastBillingAt: { lt: firstDayOfMonth } },
        ],
      },
    });

    const results: BillingDetail[] = [];

    for (const contract of pendingContracts) {
      const contractStartTime = Date.now();
      try {
        const execution = await this.prisma.$transaction(async (tx) => {
          // 1. Geração da Fatura (Invoice) baseada no Schema Real
          const invoice = await tx.invoice.create({
            data: {
              companyId: contract.companyId,
              customerId: contract.customerId,
              type: InvoiceType.SERVICE,
              status: InvoiceStatus.NORMAL,
              amount: contract.amount, // No seu schema é amount
              issuedAt: today, // No seu schema é issuedAt
              reconciled: false, // Campo presente no schema
            },
          });

          // 2. Lock de Segurança: Atualiza o contrato para evitar duplicidade
          await tx.contract.update({
            where: { id: contract.id },
            data: { lastBillingAt: today },
          });

          // 3. Registro de Auditoria (Compliance)
          await tx.auditLog.create({
            data: {
              userId,
              companyId: contract.companyId,
              action: 'CONTRACT_AUTO_BILLING',
              module: 'REVENUE',
              entity: 'Contract',
              entityId: contract.id,
              payload: {
                invoiceId: invoice.id,
                amount: contract.amount.toString(),
              } satisfies Prisma.InputJsonObject,
              responseTime: Date.now() - contractStartTime,
              statusCode: 201,
            },
          });

          return { contractId: contract.id, invoiceId: invoice.id };
        });

        results.push(execution);
        this.logger.log(`[Billing Success] Contrato ${contract.id} faturado.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        this.logger.error(`[Billing Fail] Contrato ${contract.id}: ${message}`);
      }
    }

    return {
      processed: pendingContracts.length,
      successful: results.length,
      details: results,
    };
  }

  async findByCompany(companyId: string) {
    return this.prisma.contract.findMany({
      where: { companyId, deletedAt: null },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
