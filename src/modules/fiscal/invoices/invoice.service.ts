'use strict';

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateInvoiceDto } from '../dto/create-invoice.dto.js';
import { Prisma, InvoiceStatus, NFeStatus } from '@prisma/client';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🛡️ ACESSO ESTENDIDO:
   * Utiliza a extensão do Prisma para garantir Multi-tenancy (companyId)
   * e Soft Delete (deletedAt) de forma transparente.
   */
  private get db() {
    return this.prisma.extended;
  }

  /**
   * bCost Engine: Ingestão de Nota Fiscal
   * Mapeamento estrito DTO -> Schema real do Prisma (produção).
   *
   * NOTA: Campos de retenção (ISS/IRRF/PIS/COFINS/CSLL) e payload bruto
   * ainda não existem no schema atual. Se forem necessários, devem ser
   * adicionados via migration Prisma antes de serem reintroduzidos aqui.
   */
  async create(dto: CreateInvoiceDto) {
    // 1. Validação de existência do Tenant (Safety Check)
    const company = await this.db.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa (Tenant) não cadastrada no bCost.');
    }

    try {
      // 2. Inteligência de Relacionamento: Upsert de Cliente
      // Baseado no documento (CNPJ/CPF) dentro do contexto da empresa.
      const customer = await this.db.customer.upsert({
        where: {
          companyId_document: {
            companyId: dto.companyId,
            document: dto.customerDocument || '00000000000',
          },
        },
        update: {
          name: dto.customerName || 'Cliente Consumidor',
          active: true,
        },
        create: {
          companyId: dto.companyId,
          document: dto.customerDocument || '00000000000',
          name: dto.customerName || 'Cliente Consumidor',
        },
      });

      // 3. Persistência Canônica (Mapeamento DTO -> Schema)
      return await this.db.invoice.create({
        data: {
          companyId: dto.companyId,
          customerId: customer.id,
          accessKey: dto.accessKey,
          number: dto.number,
          type: dto.type,
          status: dto.status || InvoiceStatus.NORMAL,
          nfeStatus: dto.nfeStatus || NFeStatus.AUTHORIZED,

          // Valores Financeiros (Conversão para Decimal Prisma)
          amount: new Prisma.Decimal(dto.totalValue),
          taxAmount: new Prisma.Decimal(dto.taxableValue),

          // Datas e Flags
          issuedAt: new Date(dto.issueDate),
          reconciled: false,

          // Versão (controle otimista)
          version: 1,
        },
      });
    } catch (error: any) {
      // P2002: Violação de Unique Constraint (accessKey já existente)
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Conflito: A Nota Fiscal com Chave ${dto.accessKey} já está registrada.`,
        );
      }
      this.logger.error(`[InvoiceService] Falha crítica na criação: ${error.message}`);
      throw error;
    }
  }

  /**
   * Busca de Notas: O isolamento por companyId é injetado automaticamente pelo PrismaService.
   */
  async getInvoicesByCompany(companyId: string, filters?: any) {
    return this.db.invoice.findMany({
      where: {
        companyId,
        issuedAt: {
          gte: filters?.startDate ? new Date(filters.startDate) : undefined,
          lte: filters?.endDate ? new Date(filters.endDate) : undefined,
        },
        // Filtro de status se fornecido
        status: filters?.status ? filters.status : undefined,
      },
      include: {
        customer: {
          select: { name: true, document: true },
        },
        sefazEvents: true, // Rastreabilidade total
      },
      orderBy: { issuedAt: 'desc' },
      take: filters?.limit ? Number(filters.limit) : 100,
    });
  }

  /**
   * Busca Individual com Proteção de Tenant
   */
  async findOne(id: string) {
    const invoice = await this.db.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        sefazEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Nota fiscal não localizada no bCost.');
    }
    return invoice;
  }

  /**
   * Remoção (Soft Delete)
   * O interceptor do PrismaService garantirá que apenas o 'deletedAt' seja preenchido.
   */
  async remove(id: string) {
    // Validamos se existe antes de tentar deletar
    await this.findOne(id);
    return this.db.invoice.delete({ where: { id } });
  }
}
