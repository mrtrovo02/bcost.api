'use strict';

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { EnterpriseModuleQueryDto } from './dto/enterprise-module-query.dto.js';
import { EnterpriseModulesService } from './enterprise-modules.service.js';

@ApiTags('Enterprise Modules')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('enterprise/modules')
export class EnterpriseModulesController {
  constructor(private readonly service: EnterpriseModulesService) {}

  @Get()
  @ApiOperation({
    summary: 'ENTERPRISE: Catálogo de módulos disponíveis',
  })
  catalog() {
    return this.service.listCatalog();
  }

  @Get(':slug/:companyId/summary')
  @ApiOperation({
    summary: 'ENTERPRISE: Resumo de um módulo por empresa',
  })
  summary(
    @Param('slug') slug: string,
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: EnterpriseModuleQueryDto,
  ) {
    return this.service.summary(slug, companyId, query);
  }

  @Get(':slug/:companyId/health')
  @ApiOperation({
    summary: 'ENTERPRISE: Health de um módulo por empresa',
  })
  health(
    @Param('slug') slug: string,
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ) {
    return this.service.health(slug, companyId);
  }

  @Get(':slug/:companyId')
  @ApiOperation({
    summary: 'ENTERPRISE: Listagem padronizada de um módulo por empresa',
  })
  list(
    @Param('slug') slug: string,
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: EnterpriseModuleQueryDto,
  ) {
    return this.service.list(slug, companyId, query);
  }
}
