'use strict';

import {
  Body,
  Controller,
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
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { CreateEmployeeEnterpriseDto } from './dto/create-employee-enterprise.dto.js';
import { CreatePayrollEnterpriseDto } from './dto/create-payroll-enterprise.dto.js';
import { CreatePayrollEntryEnterpriseDto } from './dto/create-payroll-entry-enterprise.dto.js';
import { GeneratePayrollEnterpriseDto } from './dto/generate-payroll-enterprise.dto.js';
import { PayrollEnterpriseQueryDto } from './dto/payroll-enterprise-query.dto.js';
import { UpdateEmployeeEnterpriseDto } from './dto/update-employee-enterprise.dto.js';
import { UpdatePayrollEntryEnterpriseDto } from './dto/update-payroll-entry-enterprise.dto.js';
import { PayrollEnterpriseService } from './payroll-enterprise.service.js';

@UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
@Controller('payroll/enterprise')
export class PayrollEnterpriseController {
  constructor(private readonly service: PayrollEnterpriseService) {}

  @Get('summary/:companyId')
  summary(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: any,
  ) {
    return this.service.summary(companyId, req.user);
  }

  @Get('employees/:companyId')
  listEmployees(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: PayrollEnterpriseQueryDto,
    @Req() req: any,
  ) {
    return this.service.listEmployees(companyId, query, req.user);
  }

  @Post('employees/:companyId')
  createEmployee(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateEmployeeEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.createEmployee(companyId, body, req.user);
  }

  @Patch('employees/:companyId/:employeeId')
  updateEmployee(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() body: UpdateEmployeeEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.updateEmployee(companyId, employeeId, body, req.user);
  }

  @Post('employees/:companyId/:employeeId/deactivate')
  deactivateEmployee(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Req() req: any,
  ) {
    return this.service.deactivateEmployee(companyId, employeeId, req.user);
  }

  @Get('payrolls/:companyId')
  listPayrolls(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: PayrollEnterpriseQueryDto,
    @Req() req: any,
  ) {
    return this.service.listPayrolls(companyId, query, req.user);
  }

  @Post('payrolls/:companyId')
  createPayroll(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreatePayrollEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.createPayroll(companyId, body, req.user);
  }

  @Post('payrolls/:companyId/generate')
  generatePayroll(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: GeneratePayrollEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.generatePayroll(companyId, body, req.user);
  }

  @Get('entries/:companyId')
  listPayrollEntries(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: PayrollEnterpriseQueryDto,
    @Req() req: any,
  ) {
    return this.service.listPayrollEntries(companyId, query, req.user);
  }

  @Post('entries/:companyId')
  createPayrollEntry(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreatePayrollEntryEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.createPayrollEntry(companyId, body, req.user);
  }

  @Patch('entries/:companyId/:payrollEntryId')
  updatePayrollEntry(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('payrollEntryId', new ParseUUIDPipe()) payrollEntryId: string,
    @Body() body: UpdatePayrollEntryEnterpriseDto,
    @Req() req: any,
  ) {
    return this.service.updatePayrollEntry(
      companyId,
      payrollEntryId,
      body,
      req.user,
    );
  }
}
