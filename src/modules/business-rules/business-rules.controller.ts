import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { BusinessRulesService } from './business-rules.service.js';
import { CreateBusinessRuleDto } from './dto/create-business-rule.dto.js';
import { UpdateBusinessRuleDto } from './dto/update-business-rule.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';

@ApiTags('Business Rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('business-rules')
export class BusinessRulesController {
  constructor(private readonly businessRulesService: BusinessRulesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova regra de negócio' })
  @ApiResponse({ status: 201, description: 'Regra criada.' })
  create(@Body() createDto: CreateBusinessRuleDto) {
    return this.businessRulesService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as regras de uma empresa' })
  @ApiQuery({ name: 'companyId', required: true })
  findAll(@Query('companyId', ParseUUIDPipe) companyId: string) {
    return this.businessRulesService.findAll(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma regra' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.businessRulesService.findOne(id, companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar uma regra' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId', ParseUUIDPipe) companyId: string,
    @Body() updateDto: UpdateBusinessRuleDto,
  ) {
    return this.businessRulesService.update(id, companyId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover uma regra' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.businessRulesService.remove(id, companyId);
  }
}
