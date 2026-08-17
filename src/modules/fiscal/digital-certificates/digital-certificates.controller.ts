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

@Controller('digital-certificates')
export class DigitalCertificatesController {
  constructor(
    private readonly digitalCertificatesService: DigitalCertificatesService,
  ) {}

  @Post()
  create(@Body() createDigitalCertificateDto: CreateDigitalCertificateDto) {
    return this.digitalCertificatesService.create(createDigitalCertificateDto);
  }

  @Get()
  findAll(@Query('companyId') companyId?: string) {
    return this.digitalCertificatesService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.digitalCertificatesService.findOne(id);
  }

  @Patch(':id')
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
  remove(@Param('id') id: string) {
    return this.digitalCertificatesService.remove(id);
  }
}
