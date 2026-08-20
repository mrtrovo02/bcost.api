import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { DigitalCertificatesService } from './digital-certificates.service';
import { CreateDigitalCertificateDto } from './dto/create-digital-certificate.dto';
import { UpdateDigitalCertificateDto } from './dto/update-digital-certificate.dto';
import { LegacyApiAlias } from '../../../common/decorators/legacy-api-alias.decorator.js';

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
  findAll(@Query('companyId') companyId?: string) {
    return this.digitalCertificatesService.findAll(companyId);
  }

  @Get(':id')
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId/:certificateId')
  findOne(@Param('id') id: string) {
    return this.digitalCertificatesService.findOne(id);
  }

  @Patch(':id')
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId/:certificateId')
  update(
    @Param('id') id: string,
    @Body() updateDigitalCertificateDto: UpdateDigitalCertificateDto,
  ) {
    return this.digitalCertificatesService.update(
      id,
      updateDigitalCertificateDto,
    );
  }

  @Delete(':id')
  @LegacyApiAlias('/digital-certificates/enterprise/:companyId/:certificateId')
  remove(@Param('id') id: string) {
    return this.digitalCertificatesService.remove(id);
  }
}
