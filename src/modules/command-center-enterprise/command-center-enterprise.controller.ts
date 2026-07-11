'use strict';

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CommandCenterQueryDto } from './dto/command-center-query.dto.js';
import { CommandCenterEnterpriseService } from './command-center-enterprise.service.js';

@UseGuards(JwtAuthGuard)
@Controller('operations/command-center')
export class CommandCenterEnterpriseController {
  constructor(private readonly service: CommandCenterEnterpriseService) {}

  @Get(':companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: CommandCenterQueryDto,
    @Req() req: any,
  ) {
    return this.service.summary(companyId, query, req.user);
  }

  @Get(':companyId/risks')
  risks(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: CommandCenterQueryDto,
    @Req() req: any,
  ) {
    return this.service.risks(companyId, query, req.user);
  }

  @Get(':companyId/modules')
  modules(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: CommandCenterQueryDto,
    @Req() req: any,
  ) {
    return this.service.modules(companyId, query, req.user);
  }

  @Get(':companyId/activity')
  activity(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: CommandCenterQueryDto,
    @Req() req: any,
  ) {
    return this.service.activity(companyId, query, req.user);
  }
}
