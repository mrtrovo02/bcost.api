import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CompanyService } from './company.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';

@ApiTags('Company')
@ApiBearerAuth()
@Controller('company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar uma nova empresa' })
  @ApiResponse({ status: 201, description: 'Empresa criada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 409, description: 'CNPJ já cadastrado.' })
  create(@Body() dto: CreateCompanyDto, @GetUser('id') userId: string) {
    return this.companyService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as empresas' })
  @ApiResponse({ status: 200, description: 'Lista de empresas retornada.' })
  findAll(@GetUser('id') userId: string) {
    return this.companyService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma empresa pelo ID' })
  @ApiParam({ name: 'id', description: 'ID da empresa', example: 'uuid' })
  @ApiResponse({ status: 200, description: 'Empresa encontrada.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.companyService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados cadastrais e fiscais da empresa' })
  @ApiParam({ name: 'id', description: 'ID da empresa', example: 'uuid' })
  @ApiResponse({ status: 200, description: 'Empresa atualizada.' })
  @ApiResponse({ status: 403, description: 'Usuário sem permissão de gestão.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompanyDto,
    @GetUser('id') userId: string,
  ) {
    return this.companyService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover uma empresa (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID da empresa', example: 'uuid' })
  @ApiResponse({ status: 204, description: 'Empresa removida.' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada.' })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.companyService.delete(id, userId);
  }
}
