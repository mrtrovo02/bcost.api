'use strict';

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service.js';
import { ContractService } from './contract.service.js';
import { CreateContractDto } from './dto/create-contract.dto.js';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar contrato recorrente' })
  async create(@Body() dto: CreateContractDto) {
    let customerId = dto.customerId;

    if (!customerId) {
      const customer = await this.prisma.customer.upsert({
        where: {
          companyId_document: {
            companyId: dto.companyId,
            document: dto.customerDocument ?? '',
          },
        },
        create: {
          companyId: dto.companyId,
          name: dto.customerName ?? 'Cliente sem nome',
          document: dto.customerDocument ?? '',
          email: dto.customerEmail ?? null,
        },
        update: {
          name: dto.customerName ?? 'Cliente sem nome',
          email: dto.customerEmail ?? null,
          active: true,
          deletedAt: null,
        },
      });

      customerId = customer.id;
    }

    return this.contractService.create(dto.companyId, dto.toPrisma(customerId));
  }

  @Get()
  @ApiOperation({ summary: 'Listar contratos por empresa' })
  findAll(@Query('companyId') companyId: string) {
    return this.contractService.findByCompany(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter contrato por ID' })
  findOne(@Param('id') id: string) {
    return this.prisma.contract.findUnique({
      where: { id },
      include: { customer: true },
    });
  }
}
