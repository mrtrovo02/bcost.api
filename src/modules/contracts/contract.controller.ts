'use strict';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CompanyRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ContractService } from './contract.service.js';
import { CreateContractDto } from './dto/create-contract.dto.js';

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT, CompanyRole.MANAGER)
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
  findAll(@Query('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.contractService.findByCompany(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter contrato por ID' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const companyId =
      req.companyId || req.user.companyId || req.user.activeCompanyId;

    if (!companyId) {
      throw new BadRequestException(
        'Empresa ativa é obrigatória para consultar contrato.',
      );
    }

    return this.prisma.contract.findFirst({
      where: { id, companyId },
      include: { customer: true },
    });
  }
}
