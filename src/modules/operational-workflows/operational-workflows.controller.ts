'use strict';

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PreviewOperationalWorkflowDto } from './dto/preview-operational-workflow.dto.js';
import { OperationalWorkflowsService } from './operational-workflows.service.js';

@Public()
@Controller('operations/workflows')
export class OperationalWorkflowsController {
  constructor(private readonly workflows: OperationalWorkflowsService) {}

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
