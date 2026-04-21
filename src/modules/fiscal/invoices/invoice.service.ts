'use strict';

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateInvoiceDto } from '../dto/create-invoice.dto.js';
import { Prisma, InvoiceStatus } from '@prisma/client';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🛡️ ACESSO ESTENDIDO:
   * Utilizamos 'extended' para ativar o Soft Delete e Filtros Globais definidos no PrismaService.
   */
  private get db() {
    return this.prisma.extended;
  }

  /**
   * Cria uma nota fiscal via cadastro manual ou processamento.
   * Alinhado ao Schema 2026 e com Upsert de cliente.
   */
  async create(dto: CreateInvoiceDto) {
    const company = await this.db.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa não cadastrada no bCost.');
    }

    try {
      // Garantia do Cliente (Upsert) - Essencial para integridade referencial
      const customer = await this.db.customer.upsert({
        where: {
          companyId_document: {
            companyId: dto.companyId,
            document: dto.customerDocument,
          },
        },
        update: { name: dto.customerName },
        create: {
          companyId: dto.companyId,
          document: dto.customerDocument,
          name: dto.customerName,
        },
      });

      return await this.db.invoice.create({
        data: {
          companyId: dto.companyId,
          customerId: customer.id,
          amount: new Prisma.Decimal(dto.amount),
          issuedAt: new Date(dto.issuedAt),
          type: dto.type,
          status: dto.status || InvoiceStatus.NORMAL,
          reconciled: false,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Esta nota fiscal já foi registrada para este cliente.`,
        );
      }
      this.logger.error(`[InvoiceService] Erro na criação: ${error.message}`);
      throw error;
    }
  }

  /**
   * Busca notas de uma empresa.
   * O PrismaService.extended filtrará automaticamente onde deletedAt for null.
   */
  async getInvoicesByCompany(companyId: string) {
    return this.db.invoice.findMany({
      where: { companyId },
      include: {
        customer: {
          select: { name: true, document: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Remove uma nota fiscal (Soft Delete Automático).
   * O interceptor do PrismaService transformará esta chamada em um Update.
   */
  async remove(id: string) {
    const invoice = await this.db.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Nota fiscal não encontrada.');

    // Como usamos 'this.db' (extended), isso NÃO deleta o registro fisicamente
    return this.db.invoice.delete({ where: { id } });
  }
}
