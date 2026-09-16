'use strict';

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { EvaluateServiceRequestDto } from './dto/evaluate-service-request.dto.js';
import { ServiceCatalogService } from './service-catalog.service.js';

@Public()
@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get()
  getCatalog() {
    return {
      status: 'OK',
      catalog: this.serviceCatalogService.getCatalog(),
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('macro-services/:id')
  getMacroService(@Param('id', ParseIntPipe) id: number) {
    return {
      status: 'OK',
      item: this.serviceCatalogService.getMacroService(id),
      generatedAt: new Date().toISOString(),
    };
  }

  @Post('evaluate')
  evaluate(@Body() body: EvaluateServiceRequestDto) {
    return this.serviceCatalogService.evaluate(body);
  }
}
