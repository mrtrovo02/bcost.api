'use strict';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeRegime,
  EntryOrigin,
  FinancialEventType,
  Prisma,
} from '@prisma/client';
import type { Employee, Payroll, PayrollEntry } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateEmployeeEnterpriseDto } from './dto/create-employee-enterprise.dto.js';
import { CreatePayrollEnterpriseDto } from './dto/create-payroll-enterprise.dto.js';
import { CreatePayrollEntryEnterpriseDto } from './dto/create-payroll-entry-enterprise.dto.js';
import { GeneratePayrollEnterpriseDto } from './dto/generate-payroll-enterprise.dto.js';
import { PayrollEnterpriseQueryDto } from './dto/payroll-enterprise-query.dto.js';
import { UpdateEmployeeEnterpriseDto } from './dto/update-employee-enterprise.dto.js';
import { UpdatePayrollEntryEnterpriseDto } from './dto/update-payroll-entry-enterprise.dto.js';

type AuthUser = {
  id?: string;
  sub?: string;
  email?: string;
  role?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
};

type Amounts = {
  baseSalary: number;
  inssEmployee: number;
  inssEmployer: number;
  irrf: number;
  fgts: number;
  otherBenefits: number;
  otherDeductions: number;
  netSalary: number;
};

type EmployeeRecord = Employee;
type PayrollRecord = Payroll & {
  entries?: PayrollEntryRecord[];
};
type PayrollEntryRecord = PayrollEntry & {
  employee?: EmployeeRecord | null;
  payroll?: PayrollRecord | null;
};

type EmployeeOperationalStatus = 'ACTIVE' | 'INACTIVE' | 'DELETED';

type EnrichedEmployee = Omit<
  EmployeeRecord,
  | 'baseSalary'
  | 'admissionAt'
  | 'dismissalAt'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
> & {
  baseSalary: number;
  admissionAt: string | null;
  dismissalAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  operationalStatus: EmployeeOperationalStatus;
};

type EnrichedPayroll = Omit<
  PayrollRecord,
  'salariesAmount' | 'proLaboreAmount' | 'totalAmount' | 'createdAt'
> & {
  salariesAmount: number;
  proLaboreAmount: number;
  totalAmount: number;
  createdAt: string | null;
  periodLabel: string;
};

type EnrichedPayrollEntry = Omit<
  PayrollEntryRecord,
  | 'baseSalary'
  | 'inssEmployee'
  | 'inssEmployer'
  | 'irrf'
  | 'fgts'
  | 'otherBenefits'
  | 'otherDeductions'
  | 'netSalary'
  | 'createdAt'
> & {
  baseSalary: number;
  inssEmployee: number;
  inssEmployer: number;
  irrf: number;
  fgts: number;
  otherBenefits: number;
  otherDeductions: number;
  netSalary: number;
  createdAt: string | null;
};

@Injectable()
export class PayrollEnterpriseService {
  private static readonly PAGE_LIMIT_DEFAULT = 100;
  private static readonly PAGE_LIMIT_MAX = 500;
  private static readonly SUMMARY_LIMIT_MAX = 5000;

  private readonly logger = new Logger(PayrollEnterpriseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get employeeModel(): PrismaService['employee'] {
    return this.prisma.employee;
  }

  private get payrollModel(): PrismaService['payroll'] {
    return this.prisma.payroll;
  }

  private get payrollEntryModel(): PrismaService['payrollEntry'] {
    return this.prisma.payrollEntry;
  }

  private get auditLogModel(): PrismaService['auditLog'] {
    return this.prisma.auditLog;
  }

  private get financialEventModel(): PrismaService['financialEvent'] {
    return this.prisma.financialEvent;
  }

  private get accountingEntryModel(): PrismaService['accountingEntry'] {
    return this.prisma.accountingEntry;
  }

  private getUserId(user?: AuthUser): string | null {
    return user?.id || user?.sub || null;
  }

  private validateCompanyAccess(companyId: string, user?: AuthUser) {
    const tokenCompanyId = user?.companyId;
    const role = String(user?.role || '').toUpperCase();

    if (!tokenCompanyId) return;

    if (
      tokenCompanyId !== companyId &&
      !['SUPER_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'].includes(role)
    ) {
      throw new ForbiddenException(
        'Acesso negado: empresa do token não corresponde à empresa solicitada.',
      );
    }
  }

  private validateWritePermission(user?: AuthUser) {
    const role = String(user?.role || '').toUpperCase();

    if (!role) return;

    const allowed = [
      'OWNER',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'FINANCE',
      'HR',
      'SUPER_ADMIN',
      'PLATFORM_ADMIN',
    ];

    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        'Perfil sem permissão para folha enterprise.',
      );
    }
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} inválido.`);
    }

    return parsed;
  }

  private toNumber(value: unknown): number {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    return Number(value || 0);
  }

  private money(value: number): number {
    return Number(Number(value || 0).toFixed(2));
  }

  private parseEmployeeRegime(value: string | undefined): EmployeeRegime {
    if (!value) return EmployeeRegime.CLT;

    if (Object.values(EmployeeRegime).includes(value as EmployeeRegime)) {
      return value as EmployeeRegime;
    }

    throw new BadRequestException(`Regime de colaborador inválido: ${value}`);
  }

  private normalize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) return value.map((item) => this.normalize(item));

    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value))
        out[key] = this.normalize(inner);
      return out;
    }

    return value;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof Prisma.Decimal)
    );
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null) return null;
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (value instanceof Date) return value.toISOString();

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      return value.map((item) => this.toInputJsonValue(item));
    }

    if (this.isPlainRecord(value)) {
      return this.toJsonObject(value);
    }

    return String(value);
  }

  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    if (!this.isPlainRecord(value)) return {};

    const output: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, innerValue] of Object.entries(value)) {
      if (innerValue !== undefined) {
        output[key] = this.toInputJsonValue(innerValue);
      }
    }

    return output as Prisma.InputJsonObject;
  }

  private async findCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
    });

    if (!company)
      throw new NotFoundException(`Empresa não encontrada: ${companyId}`);

    return company;
  }

  private async safeAuditLog(params: {
    companyId: string;
    user?: AuthUser;
    module: 'employees' | 'payrolls' | 'payroll-entries';
    action: string;
    entity: 'Employee' | 'Payroll' | 'PayrollEntry';
    entityId?: string | null;
    payload?: Record<string, unknown>;
    statusCode?: number;
  }) {
    const userId = this.getUserId(params.user);

    const payload = this.toJsonObject({
      ...(params.payload || {}),
      source: 'payroll-enterprise',
      severity: params.statusCode && params.statusCode >= 400 ? 'WARN' : 'INFO',
      auditSchemaVersion: 'auditlog-v1-schema-first',
      recordedAt: new Date().toISOString(),
    });

    const base = {
      module: params.module,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      payload,
      statusCode: params.statusCode ?? 200,
      responseTime: null,
      ipAddress: null,
      userAgent: null,
    };

    const candidates: Array<{
      label: string;
      data: Prisma.AuditLogUncheckedCreateInput;
    }> = [
      {
        label: 'scalar',
        data: {
          companyId: params.companyId,
          ...(userId ? { userId } : {}),
          ...base,
        },
      },
      {
        label: 'minimal',
        data: {
          companyId: params.companyId,
          module: params.module,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          payload,
        },
      },
    ];

    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        await this.auditLogModel.create({ data: candidate.data });
        return { recorded: true };
      } catch (error) {
        errors.push(
          `[${candidate.label}] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const error = errors.at(-1) || 'Falha desconhecida ao gravar auditoria.';
    this.logger.warn(`[PayrollEnterprise] AuditLog skipped: ${error}`);

    return {
      recorded: false,
      error,
    };
  }

  private enrichEmployee(employee: EmployeeRecord): EnrichedEmployee {
    return {
      ...employee,
      baseSalary: this.toNumber(employee.baseSalary),
      admissionAt: employee.admissionAt
        ? new Date(employee.admissionAt).toISOString()
        : null,
      dismissalAt: employee.dismissalAt
        ? new Date(employee.dismissalAt).toISOString()
        : null,
      createdAt: employee.createdAt
        ? new Date(employee.createdAt).toISOString()
        : null,
      updatedAt: employee.updatedAt
        ? new Date(employee.updatedAt).toISOString()
        : null,
      deletedAt: employee.deletedAt
        ? new Date(employee.deletedAt).toISOString()
        : null,
      operationalStatus: employee.deletedAt
        ? 'DELETED'
        : employee.active
          ? 'ACTIVE'
          : 'INACTIVE',
    };
  }

  private enrichPayroll(payroll: PayrollRecord): EnrichedPayroll {
    return {
      ...payroll,
      salariesAmount: this.toNumber(payroll.salariesAmount),
      proLaboreAmount: this.toNumber(payroll.proLaboreAmount),
      totalAmount: this.toNumber(payroll.totalAmount),
      createdAt: payroll.createdAt
        ? new Date(payroll.createdAt).toISOString()
        : null,
      periodLabel: `${String(payroll.month).padStart(2, '0')}/${payroll.year}`,
    };
  }

  private enrichEntry(entry: PayrollEntryRecord): EnrichedPayrollEntry {
    return {
      ...entry,
      baseSalary: this.toNumber(entry.baseSalary),
      inssEmployee: this.toNumber(entry.inssEmployee),
      inssEmployer: this.toNumber(entry.inssEmployer),
      irrf: this.toNumber(entry.irrf),
      fgts: this.toNumber(entry.fgts),
      otherBenefits: this.toNumber(entry.otherBenefits),
      otherDeductions: this.toNumber(entry.otherDeductions),
      netSalary: this.toNumber(entry.netSalary),
      createdAt: entry.createdAt
        ? new Date(entry.createdAt).toISOString()
        : null,
    };
  }

  private employeeWhere(companyId: string, query: PayrollEnterpriseQueryDto) {
    const and: Prisma.EmployeeWhereInput[] = [{ companyId }];

    if (query.active !== undefined)
      and.push({ active: query.active === 'true' });
    if (query.regime)
      and.push({ regime: this.parseEmployeeRegime(query.regime) });

    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { cpf: { contains: query.search, mode: 'insensitive' } },
          { pis: { contains: query.search, mode: 'insensitive' } },
          { role: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private payrollWhere(companyId: string, query: PayrollEnterpriseQueryDto) {
    const and: Prisma.PayrollWhereInput[] = [{ companyId }];

    if (query.month) and.push({ month: query.month });
    if (query.year) and.push({ year: query.year });

    return and.length === 1 ? { companyId } : { AND: and };
  }

  private entryWhere(companyId: string, query: PayrollEnterpriseQueryDto) {
    const and: Prisma.PayrollEntryWhereInput[] = [{ payroll: { companyId } }];

    if (query.payrollId) and.push({ payrollId: query.payrollId });
    if (query.employeeId) and.push({ employeeId: query.employeeId });

    if (query.month || query.year) {
      const payroll: Record<string, unknown> = { companyId };
      if (query.month) payroll.month = query.month;
      if (query.year) payroll.year = query.year;
      and.push({ payroll });
    }

    if (query.search) {
      and.push({
        employee: {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { cpf: { contains: query.search, mode: 'insensitive' } },
            { role: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      });
    }

    return { AND: and };
  }

  private employeesSummary(items: Array<EmployeeRecord | EnrichedEmployee>) {
    const out = {
      count: items.length,
      active: 0,
      inactive: 0,
      deleted: 0,
      totalBaseSalary: 0,
      averageBaseSalary: 0,
      byRegime: {} as Record<string, number>,
      byRole: {} as Record<string, number>,
    };

    for (const item of items) {
      const salary = this.toNumber(item.baseSalary);
      const regime = String(item.regime || 'UNKNOWN');
      const role = String(item.role || 'UNKNOWN');

      out.totalBaseSalary += salary;
      out.byRegime[regime] = (out.byRegime[regime] || 0) + 1;
      out.byRole[role] = (out.byRole[role] || 0) + 1;

      if (item.deletedAt) out.deleted += 1;
      else if (item.active) out.active += 1;
      else out.inactive += 1;
    }

    out.totalBaseSalary = this.money(out.totalBaseSalary);
    out.averageBaseSalary = items.length
      ? this.money(out.totalBaseSalary / items.length)
      : 0;

    return out;
  }

  private payrollsSummary(items: Array<PayrollRecord | EnrichedPayroll>) {
    const out = {
      count: items.length,
      salariesAmount: 0,
      proLaboreAmount: 0,
      totalAmount: 0,
      byPeriod: {} as Record<string, number>,
    };

    for (const item of items) {
      const period = `${String(item.month).padStart(2, '0')}/${item.year}`;
      out.salariesAmount += this.toNumber(item.salariesAmount);
      out.proLaboreAmount += this.toNumber(item.proLaboreAmount);
      out.totalAmount += this.toNumber(item.totalAmount);
      out.byPeriod[period] = this.toNumber(item.totalAmount);
    }

    out.salariesAmount = this.money(out.salariesAmount);
    out.proLaboreAmount = this.money(out.proLaboreAmount);
    out.totalAmount = this.money(out.totalAmount);

    return out;
  }

  private entriesSummary(
    items: Array<PayrollEntryRecord | EnrichedPayrollEntry>,
  ) {
    const out = {
      count: items.length,
      baseSalary: 0,
      inssEmployee: 0,
      inssEmployer: 0,
      irrf: 0,
      fgts: 0,
      otherBenefits: 0,
      otherDeductions: 0,
      netSalary: 0,
      employerCost: 0,
      byRegime: {} as Record<string, number>,
    };

    for (const item of items) {
      out.baseSalary += this.toNumber(item.baseSalary);
      out.inssEmployee += this.toNumber(item.inssEmployee);
      out.inssEmployer += this.toNumber(item.inssEmployer);
      out.irrf += this.toNumber(item.irrf);
      out.fgts += this.toNumber(item.fgts);
      out.otherBenefits += this.toNumber(item.otherBenefits);
      out.otherDeductions += this.toNumber(item.otherDeductions);
      out.netSalary += this.toNumber(item.netSalary);
      out.employerCost +=
        this.toNumber(item.baseSalary) +
        this.toNumber(item.inssEmployer) +
        this.toNumber(item.fgts) +
        this.toNumber(item.otherBenefits);

      const regime = String(item.employee?.regime || 'UNKNOWN');
      out.byRegime[regime] = (out.byRegime[regime] || 0) + 1;
    }

    out.baseSalary = this.money(out.baseSalary);
    out.inssEmployee = this.money(out.inssEmployee);
    out.inssEmployer = this.money(out.inssEmployer);
    out.irrf = this.money(out.irrf);
    out.fgts = this.money(out.fgts);
    out.otherBenefits = this.money(out.otherBenefits);
    out.otherDeductions = this.money(out.otherDeductions);
    out.netSalary = this.money(out.netSalary);
    out.employerCost = this.money(out.employerCost);

    return out;
  }

  private calculateAmounts(
    employee: Pick<EmployeeRecord, 'baseSalary' | 'regime'>,
    overrides: Partial<Amounts> = {},
  ): Amounts {
    const baseSalary = this.money(
      overrides.baseSalary ?? this.toNumber(employee.baseSalary),
    );
    const regime = String(employee.regime || 'CLT');

    let inssEmployee = 0;
    let inssEmployer = 0;
    let fgts = 0;
    let irrf = 0;

    if (regime === 'CLT' || regime === 'SOCIO_ADMINISTRADOR') {
      inssEmployee = this.money(baseSalary * 0.11);
      inssEmployer = regime === 'CLT' ? this.money(baseSalary * 0.2) : 0;
      fgts = regime === 'CLT' ? this.money(baseSalary * 0.08) : 0;

      if (baseSalary > 4664.68) irrf = this.money(baseSalary * 0.075);
      else if (baseSalary > 2826.65) irrf = this.money(baseSalary * 0.04);
    }

    const out: Amounts = {
      baseSalary,
      inssEmployee: this.money(overrides.inssEmployee ?? inssEmployee),
      inssEmployer: this.money(overrides.inssEmployer ?? inssEmployer),
      irrf: this.money(overrides.irrf ?? irrf),
      fgts: this.money(overrides.fgts ?? fgts),
      otherBenefits: this.money(overrides.otherBenefits ?? 0),
      otherDeductions: this.money(overrides.otherDeductions ?? 0),
      netSalary: 0,
    };

    out.netSalary = this.money(
      overrides.netSalary ??
        out.baseSalary +
          out.otherBenefits -
          out.inssEmployee -
          out.irrf -
          out.otherDeductions,
    );

    return out;
  }

  private async recomputePayrollTotals(
    tx: Prisma.TransactionClient,
    payrollId: string,
  ) {
    const entries = await tx.payrollEntry.findMany({ where: { payrollId } });

    const salariesAmount = this.money(
      entries.reduce((sum, entry) => sum + this.toNumber(entry.baseSalary), 0),
    );

    const totalAmount = this.money(
      entries.reduce(
        (sum, entry) =>
          sum +
          this.toNumber(entry.netSalary) +
          this.toNumber(entry.inssEmployer) +
          this.toNumber(entry.fgts),
        0,
      ),
    );

    return tx.payroll.update({
      where: { id: payrollId },
      data: {
        salariesAmount,
        proLaboreAmount: 0,
        totalAmount,
      },
    });
  }

  private async createFinancialEvent(
    companyId: string,
    payroll: Pick<PayrollRecord, 'id' | 'month' | 'year'>,
    amount: number,
  ) {
    try {
      const event = await this.financialEventModel.create({
        data: {
          companyId,
          type: FinancialEventType.PAYROLL_PAID,
          amount,
          description: `Folha de pagamento ${String(payroll.month).padStart(2, '0')}/${payroll.year}`,
          referenceId: payroll.id,
          referenceType: 'PAYROLL',
          month: payroll.month,
          year: payroll.year,
          occurredAt: new Date(Date.UTC(payroll.year, payroll.month - 1, 28)),
          metadata: {
            payrollId: payroll.id,
            source: 'payroll-enterprise',
          },
        },
      });

      return { recorded: true, event: this.normalize(event) };
    } catch (error) {
      return {
        recorded: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createAccountingEntry(
    companyId: string,
    payroll: Pick<PayrollRecord, 'id' | 'month' | 'year'>,
    amount: number,
  ) {
    try {
      const entry = await this.accountingEntryModel.create({
        data: {
          companyId,
          date: new Date(Date.UTC(payroll.year, payroll.month - 1, 28)),
          description: `Lançamento automático de folha ${String(payroll.month).padStart(2, '0')}/${payroll.year}`,
          debitCode: '5.1.01',
          creditCode: '2.1.01',
          amount,
          origin: EntryOrigin.PAYROLL_AUTO,
          referenceId: payroll.id,
          referenceType: 'PAYROLL',
          month: payroll.month,
          year: payroll.year,
          locked: false,
        },
      });

      return { recorded: true, entry: this.normalize(entry) };
    } catch (error) {
      return {
        recorded: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listEmployees(
    companyId: string,
    query: PayrollEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(
      Math.max(Number(query.limit || PayrollEnterpriseService.PAGE_LIMIT_DEFAULT), 1),
      PayrollEnterpriseService.PAGE_LIMIT_MAX,
    );
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.employeeModel.findMany({
      where: this.employeeWhere(companyId, query),
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => this.enrichEmployee(item));

    return {
      status: 'OK',
      module: 'employees',
      model: 'Employee',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.employeesSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createEmployee(
    companyId: string,
    dto: CreateEmployeeEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const cpf = dto.cpf.replace(/\D/g, '');

    const existing = await this.employeeModel.findFirst({
      where: { companyId, cpf },
    });

    if (existing) {
      throw new ConflictException(
        'Já existe colaborador com este CPF nesta empresa.',
      );
    }

    const created = await this.employeeModel.create({
      data: {
        companyId,
        name: dto.name.trim(),
        cpf,
        pis: dto.pis?.trim() || null,
        admissionAt: this.parseDate(dto.admissionAt, 'admissionAt'),
        dismissalAt: dto.dismissalAt
          ? this.parseDate(dto.dismissalAt, 'dismissalAt')
          : null,
        role: dto.role.trim(),
        baseSalary: dto.baseSalary,
        active: dto.active ?? true,
        regime: this.parseEmployeeRegime(dto.regime),
      },
    });

    const item = this.enrichEmployee(created);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'employees',
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: created.id,
      payload: { item: this.normalize(item) },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Colaborador criado com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateEmployee(
    companyId: string,
    employeeId: string,
    dto: UpdateEmployeeEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.employeeModel.findFirst({
      where: { id: employeeId, companyId },
    });

    if (!current)
      throw new NotFoundException(`Colaborador não encontrado: ${employeeId}`);

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.cpf !== undefined) data.cpf = dto.cpf.replace(/\D/g, '');
    if (dto.pis !== undefined) data.pis = dto.pis?.trim() || null;
    if (dto.admissionAt !== undefined)
      data.admissionAt = this.parseDate(dto.admissionAt, 'admissionAt');
    if (dto.dismissalAt !== undefined) {
      data.dismissalAt = dto.dismissalAt
        ? this.parseDate(dto.dismissalAt, 'dismissalAt')
        : null;
    }
    if (dto.role !== undefined) data.role = dto.role.trim();
    if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.regime !== undefined)
      data.regime = this.parseEmployeeRegime(dto.regime);

    const updated = await this.employeeModel.update({
      where: { id: employeeId },
      data,
    });

    const item = this.enrichEmployee(updated);

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'employees',
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: employeeId,
      payload: {
        before: this.normalize(this.enrichEmployee(current)),
        after: this.normalize(item),
      },
    });

    return {
      status: 'OK',
      message: 'Colaborador atualizado com sucesso.',
      companyId,
      item: this.normalize(item),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async deactivateEmployee(
    companyId: string,
    employeeId: string,
    user?: AuthUser,
  ) {
    return this.updateEmployee(
      companyId,
      employeeId,
      {
        active: false,
        dismissalAt: new Date().toISOString(),
      },
      user,
    );
  }

  async listPayrolls(
    companyId: string,
    query: PayrollEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(
      Math.max(Number(query.limit || PayrollEnterpriseService.PAGE_LIMIT_DEFAULT), 1),
      PayrollEnterpriseService.PAGE_LIMIT_MAX,
    );
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.payrollModel.findMany({
      where: this.payrollWhere(companyId, query),
      include: {
        entries: {
          include: { employee: true },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => this.enrichPayroll(item));

    return {
      status: 'OK',
      module: 'payrolls',
      model: 'Payroll',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.payrollsSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createPayroll(
    companyId: string,
    dto: CreatePayrollEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const existing = await this.payrollModel.findFirst({
      where: { companyId, month: dto.month, year: dto.year },
    });

    if (existing) {
      throw new ConflictException(
        `Folha ${String(dto.month).padStart(2, '0')}/${dto.year} já existe.`,
      );
    }

    const salariesAmount = this.money(dto.salariesAmount ?? 0);
    const proLaboreAmount = this.money(dto.proLaboreAmount ?? 0);
    const totalAmount = this.money(
      dto.totalAmount ?? salariesAmount + proLaboreAmount,
    );

    const created = await this.payrollModel.create({
      data: {
        companyId,
        month: dto.month,
        year: dto.year,
        salariesAmount,
        proLaboreAmount,
        totalAmount,
      },
      include: {
        entries: {
          include: { employee: true },
        },
      },
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'payrolls',
      action: 'PAYROLL_CREATED',
      entity: 'Payroll',
      entityId: created.id,
      payload: { item: this.normalize(this.enrichPayroll(created)) },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Folha criada com sucesso.',
      companyId,
      item: this.normalize(this.enrichPayroll(created)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async listPayrollEntries(
    companyId: string,
    query: PayrollEnterpriseQueryDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);

    const limit = Math.min(
      Math.max(Number(query.limit || PayrollEnterpriseService.PAGE_LIMIT_DEFAULT), 1),
      PayrollEnterpriseService.PAGE_LIMIT_MAX,
    );
    const offset = Math.max(Number(query.offset || 0), 0);

    const rows = await this.payrollEntryModel.findMany({
      where: this.entryWhere(companyId, query),
      include: {
        employee: true,
        payroll: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      skip: offset,
    });

    const items = rows.slice(0, limit).map((item) => this.enrichEntry(item));

    return {
      status: 'OK',
      module: 'payroll-entries',
      model: 'PayrollEntry',
      companyId,
      items: this.normalize(items),
      total: offset + items.length,
      limit,
      offset,
      hasMore: rows.length > limit,
      summary: this.entriesSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  async createPayrollEntry(
    companyId: string,
    dto: CreatePayrollEntryEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const payroll = await this.payrollModel.findFirst({
      where: { id: dto.payrollId, companyId },
    });

    if (!payroll)
      throw new NotFoundException(`Folha não encontrada: ${dto.payrollId}`);

    const employee = await this.employeeModel.findFirst({
      where: { id: dto.employeeId, companyId, deletedAt: null },
    });

    if (!employee)
      throw new NotFoundException(
        `Colaborador não encontrado: ${dto.employeeId}`,
      );

    const amounts = this.calculateAmounts(employee, dto as Partial<Amounts>);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payrollEntry.findFirst({
        where: {
          payrollId: dto.payrollId,
          employeeId: dto.employeeId,
        },
      });

      if (existing) {
        throw new ConflictException(
          'Já existe evento de folha para este colaborador nesta competência.',
        );
      }

      const entry = await tx.payrollEntry.create({
        data: {
          payrollId: dto.payrollId,
          employeeId: dto.employeeId,
          ...amounts,
        },
        include: {
          employee: true,
          payroll: true,
        },
      });

      const updatedPayroll = await this.recomputePayrollTotals(
        tx,
        dto.payrollId,
      );

      return { entry, updatedPayroll };
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'payroll-entries',
      action: 'PAYROLL_ENTRY_CREATED',
      entity: 'PayrollEntry',
      entityId: result.entry.id,
      payload: {
        entry: this.normalize(this.enrichEntry(result.entry)),
        payroll: this.normalize(this.enrichPayroll(result.updatedPayroll)),
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Evento de folha criado com sucesso.',
      companyId,
      item: this.normalize(this.enrichEntry(result.entry)),
      payroll: this.normalize(this.enrichPayroll(result.updatedPayroll)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async updatePayrollEntry(
    companyId: string,
    payrollEntryId: string,
    dto: UpdatePayrollEntryEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);

    const current = await this.payrollEntryModel.findFirst({
      where: {
        id: payrollEntryId,
        payroll: { companyId },
      },
      include: {
        employee: true,
        payroll: true,
      },
    });

    if (!current)
      throw new NotFoundException(
        `Evento de folha não encontrado: ${payrollEntryId}`,
      );

    const amounts = this.calculateAmounts(current.employee, {
      baseSalary: dto.baseSalary ?? this.toNumber(current.baseSalary),
      inssEmployee: dto.inssEmployee ?? this.toNumber(current.inssEmployee),
      inssEmployer: dto.inssEmployer ?? this.toNumber(current.inssEmployer),
      irrf: dto.irrf ?? this.toNumber(current.irrf),
      fgts: dto.fgts ?? this.toNumber(current.fgts),
      otherBenefits: dto.otherBenefits ?? this.toNumber(current.otherBenefits),
      otherDeductions:
        dto.otherDeductions ?? this.toNumber(current.otherDeductions),
      netSalary: dto.netSalary ?? undefined,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.payrollEntry.update({
        where: { id: payrollEntryId },
        data: amounts,
        include: {
          employee: true,
          payroll: true,
        },
      });

      const updatedPayroll = await this.recomputePayrollTotals(
        tx,
        current.payrollId,
      );

      return { entry, updatedPayroll };
    });

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'payroll-entries',
      action: 'PAYROLL_ENTRY_UPDATED',
      entity: 'PayrollEntry',
      entityId: payrollEntryId,
      payload: {
        before: this.normalize(this.enrichEntry(current)),
        after: this.normalize(this.enrichEntry(result.entry)),
        payroll: this.normalize(this.enrichPayroll(result.updatedPayroll)),
      },
    });

    return {
      status: 'OK',
      message: 'Evento de folha atualizado com sucesso.',
      companyId,
      item: this.normalize(this.enrichEntry(result.entry)),
      payroll: this.normalize(this.enrichPayroll(result.updatedPayroll)),
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async generatePayroll(
    companyId: string,
    dto: GeneratePayrollEnterpriseDto,
    user?: AuthUser,
  ) {
    this.validateCompanyAccess(companyId, user);
    this.validateWritePermission(user);
    await this.findCompany(companyId);

    const employees = await this.employeeModel.findMany({
      where: { companyId, active: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    if (employees.length === 0) {
      throw new BadRequestException('Nenhum colaborador ativo encontrado.');
    }

    const existing = await this.payrollModel.findFirst({
      where: { companyId, month: dto.month, year: dto.year },
      include: { entries: true },
    });

    if ((existing?.entries?.length ?? 0) > 0 && !dto.force) {
      throw new ConflictException(
        `Folha ${String(dto.month).padStart(2, '0')}/${dto.year} já possui eventos. Use force=true para regenerar.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let payroll = existing;

      if (!payroll) {
        payroll = await tx.payroll.create({
          data: {
            companyId,
            month: dto.month,
            year: dto.year,
            salariesAmount: 0,
            proLaboreAmount: 0,
            totalAmount: 0,
          },
          include: { entries: true },
        });
      }

      if (!payroll) {
        throw new NotFoundException('Folha não encontrada após criação.');
      }

      if (dto.force) {
        await tx.payrollEntry.deleteMany({ where: { payrollId: payroll.id } });
      }

      const entries: PayrollEntryRecord[] = [];

      for (const employee of employees) {
        const amounts = this.calculateAmounts(employee);

        const entry = await tx.payrollEntry.create({
          data: {
            payrollId: payroll.id,
            employeeId: employee.id,
            ...amounts,
          },
          include: {
            employee: true,
            payroll: true,
          },
        });

        entries.push(entry);
      }

      const updatedPayroll = await this.recomputePayrollTotals(tx, payroll.id);

      return {
        payroll: updatedPayroll,
        entries,
      };
    });

    const totalAmount = this.toNumber(result.payroll.totalAmount);

    const financialEvent = dto.createFinancialEvent
      ? await this.createFinancialEvent(companyId, result.payroll, totalAmount)
      : { recorded: false, skipped: true };

    const accountingEntry = dto.createAccountingEntry
      ? await this.createAccountingEntry(companyId, result.payroll, totalAmount)
      : { recorded: false, skipped: true };

    const audit = await this.safeAuditLog({
      companyId,
      user,
      module: 'payrolls',
      action: 'PAYROLL_GENERATED',
      entity: 'Payroll',
      entityId: result.payroll.id,
      payload: {
        payroll: this.normalize(this.enrichPayroll(result.payroll)),
        entriesCount: result.entries.length,
        financialEvent,
        accountingEntry,
      },
      statusCode: 201,
    });

    return {
      status: 'OK',
      message: 'Folha gerada com sucesso.',
      companyId,
      item: this.normalize(this.enrichPayroll(result.payroll)),
      entries: this.normalize(
        result.entries.map((entry) => this.enrichEntry(entry)),
      ),
      totals: {
        employees: employees.length,
        entries: result.entries.length,
        totalAmount,
      },
      financialEvent,
      accountingEntry,
      audit,
      generatedAt: new Date().toISOString(),
    };
  }

  async summary(companyId: string, user?: AuthUser) {
    this.validateCompanyAccess(companyId, user);

    const [employees, payrolls, entries] = await Promise.all([
      this.employeeModel.findMany({
        where: { companyId },
        take: PayrollEnterpriseService.SUMMARY_LIMIT_MAX,
      }),
      this.payrollModel.findMany({
        where: { companyId },
        take: PayrollEnterpriseService.SUMMARY_LIMIT_MAX,
      }),
      this.payrollEntryModel.findMany({
        where: { payroll: { companyId } },
        include: { employee: true, payroll: true },
        take: PayrollEnterpriseService.SUMMARY_LIMIT_MAX,
      }),
    ]);

    return {
      status: 'OK',
      module: 'payroll-enterprise-summary',
      companyId,
      employees: this.employeesSummary(employees),
      payrolls: this.payrollsSummary(payrolls),
      entries: this.entriesSummary(entries),
      generatedAt: new Date().toISOString(),
    };
  }
}
