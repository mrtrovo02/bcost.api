import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { FiscalSimulationService } from './fiscal-simulation.service.js';
import { FiscalSimulationRepository } from './fiscal-simulation.repository.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('fiscal-simulation')
export class FiscalSimulationController {
  constructor(
    private readonly service: FiscalSimulationService,
    private readonly repository: FiscalSimulationRepository,
  ) {}

  @Post()
  public async simulate(
    @Body()
    body: {
      companyId?: string;
      monthlyRevenue: number;
      cbsRate: number;
      ibsRate: number;
    },
  ) {
    const result = await this.service.executeAndSave(body);
    return { success: true, data: result };
  }

  @Get('company/:companyId')
  public async getHistoryByCompany(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.repository.findByCompanyId(companyId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { success: true, ...result };
  }
}
