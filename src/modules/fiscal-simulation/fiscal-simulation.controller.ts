import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { FiscalSimulationService } from './fiscal-simulation.service.js';
import { FiscalSimulationRepository } from './fiscal-simulation.repository.js';

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
    @Param('companyId') companyId: string,
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
