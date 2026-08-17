'use strict';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CreateDigitalCertificateDto } from './dto/create-digital-certificate.dto.js';
import { QueryDigitalCertificatesDto } from './dto/query-digital-certificates.dto.js';
import { UpdateDigitalCertificateDto } from './dto/update-digital-certificate.dto.js';
import { DigitalCertificatesEnterpriseService } from './digital-certificates-enterprise.service.js';

/**
 * Controller enterprise de certificados digitais.
 *
 * Importante:
 * O projeto já possui um controller legado em:
 * /api/v1/digital-certificates/:id
 *
 * Por isso este controller usa o prefixo:
 * /api/v1/digital-certificates/enterprise
 *
 * Assim preservamos rotas antigas e adicionamos o fluxo enterprise
 * sem conflito no Fastify.
 */
@UseGuards(JwtAuthGuard)
@Controller('digital-certificates/enterprise')
export class DigitalCertificatesEnterpriseController {
  constructor(private readonly service: DigitalCertificatesEnterpriseService) {}

  @Get(':companyId')
  list(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: QueryDigitalCertificatesDto,
    @Req() req: any,
  ) {
    return this.service.list(companyId, query, req.user);
  }

  @Get(':companyId/summary')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: any,
  ) {
    return this.service.summary(companyId, req.user);
  }

  @Post(':companyId')
  create(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateDigitalCertificateDto,
    @Req() req: any,
  ) {
    return this.service.create(companyId, body, req.user);
  }

  @Get(':companyId/:certificateId')
  detail(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @Req() req: any,
  ) {
    return this.service.detail(companyId, certificateId, req.user);
  }

  @Patch(':companyId/:certificateId')
  update(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @Body() body: UpdateDigitalCertificateDto,
    @Req() req: any,
  ) {
    return this.service.update(companyId, certificateId, body, req.user);
  }

  @Post(':companyId/:certificateId/revoke')
  revoke(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @Req() req: any,
  ) {
    return this.service.revoke(companyId, certificateId, req.user);
  }

  @Delete(':companyId/:certificateId')
  remove(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @Req() req: any,
  ) {
    return this.service.remove(companyId, certificateId, req.user);
  }
}
