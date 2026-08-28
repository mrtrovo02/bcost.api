import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { RevenueService } from './revenue.service.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('revenue')
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Post('process-billing/:companyId')
  processBilling(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.revenueService.processBilling(companyId);
  }

  @Get('stats/:companyId')
  getStats(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.revenueService.getRevenueStats(companyId);
  }

  @Get('contracts/:companyId')
  getContracts(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.revenueService.getRevenueContracts(companyId);
  }

  @Get('metrics/:companyId')
  getMetrics(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.revenueService.getRevenueMetrics(companyId, month, year);
  }

  @Get('factor-r/:companyId')
  getFactorR(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.revenueService.getFactorR(companyId);
  }
}
