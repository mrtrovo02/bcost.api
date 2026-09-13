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
import { RequiresFeature } from '../billing/decorators/requires-feature.decorator.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { ContractService } from './contract.service.js';
import { CreateContractDto } from './dto/create-contract.dto.js';

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@RequiresFeature('revenue.billing')
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post()
  @Roles(CompanyRole.OWNER, CompanyRole.ACCOUNTANT, CompanyRole.MANAGER)
  @ApiOperation({ summary: 'Criar contrato recorrente' })
  async create(@Body() dto: CreateContractDto) {
    return this.contractService.createFromDto(dto);
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

    return this.contractService.findOne(companyId, id);
  }
}
