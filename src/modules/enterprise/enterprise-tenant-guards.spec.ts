import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { AccountingEnterpriseController } from '../accounting/accounting-enterprise.controller.js';
import { BankingEnterpriseController } from '../banking-enterprise/banking-enterprise.controller.js';
import { ComplianceEnterpriseController } from '../compliance-enterprise/compliance-enterprise.controller.js';
import { PayrollEnterpriseController } from '../payroll-enterprise/payroll-enterprise.controller.js';

const TENANT_GUARD_CHAIN = [
  JwtAuthGuard,
  TenantContextGuard,
  CompanyAccessGuard,
];

const COMPANY_SCOPED_ENTERPRISE_CONTROLLERS = [
  AccountingEnterpriseController,
  BankingEnterpriseController,
  ComplianceEnterpriseController,
  PayrollEnterpriseController,
];

describe('company-scoped enterprise controllers', () => {
  it.each(COMPANY_SCOPED_ENTERPRISE_CONTROLLERS)(
    'protects %p with the tenant guard chain',
    (controller) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        controller,
      ) as unknown[];

      expect(guards).toEqual(TENANT_GUARD_CHAIN);
    },
  );
});
