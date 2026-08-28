import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../../common/guards/tenant-context.guard.js';
import { DigitalCertificatesService } from './digital-certificates.service';
import { CreateDigitalCertificateDto } from './dto/create-digital-certificate.dto';
import { UpdateDigitalCertificateDto } from './dto/update-digital-certificate.dto';
import { LegacyApiAlias } from '../../../common/decorators/legacy-api-alias.decorator.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('digital-certificates')
export class DigitalCertificatesController {
  constructor(
    private readonly digitalCertificatesService: DigitalCertificatesService,
  ) {}

  @Post()
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId')
  create(@Body() createDigitalCertificateDto: CreateDigitalCertificateDto) {
    return this.digitalCertificatesService.create(createDigitalCertificateDto);
  }

  @Get()
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId')
  findAll(@Query('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.digitalCertificatesService.findAll(companyId);
  }

  @Get(':id')
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId/:certificateId')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.digitalCertificatesService.findOne(
      id,
      this.requireCompanyId(req),
    );
  }

  @Patch(':id')
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId/:certificateId')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() updateDigitalCertificateDto: UpdateDigitalCertificateDto,
  ) {
    return this.digitalCertificatesService.update(
      id,
      this.requireCompanyId(req),
      updateDigitalCertificateDto,
    );
  }

  @Delete(':id')
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId/:certificateId')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.digitalCertificatesService.remove(
      id,
      this.requireCompanyId(req),
    );
  }

  private requireCompanyId(req: AuthenticatedRequest): string {
    const companyId =
      req.companyId || req.user.companyId || req.user.activeCompanyId;

    if (!companyId) {
      throw new BadRequestException(
        'Empresa ativa é obrigatória para operar certificados digitais.',
      );
    }

    return companyId;
  }
}
