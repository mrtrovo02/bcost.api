'use strict';

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PreviewOperationalWorkflowDto } from './dto/preview-operational-workflow.dto.js';
import { OperationalWorkflowsService } from './operational-workflows.service.js';

@Public()
@Controller('operations/workflows')
export class OperationalWorkflowsController {
  constructor(private readonly workflows: OperationalWorkflowsService) {}

  @Get('capabilities')
  capabilities() {
    return {
      status: 'OK',
      capabilities: this.workflows.listCapabilities(),
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('templates/:serviceId')
  previewByServiceId(@Param('serviceId') serviceId: string) {
    return {
      status: 'OK',
      workflow: this.workflows.previewByServiceId(serviceId),
    };
  }

  @Post('preview')
  preview(@Body() body: PreviewOperationalWorkflowDto) {
    return {
      status: 'OK',
      workflow: this.workflows.preview(body),
    };
  }
}
