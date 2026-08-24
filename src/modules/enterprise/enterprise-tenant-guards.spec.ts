import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { AccountingEnterpriseController } from '../accounting/accounting-enterprise.controller.js';
import { AuditController } from '../audit/audit.controller.js';
import { AuditIntelligenceEnterpriseController } from '../audit-intelligence-enterprise/audit-intelligence-enterprise.controller.js';
import { AutomationJobsEnterpriseController } from '../automation/automation-jobs-enterprise.controller.js';
import { BankingController } from '../banking/banking.controller.js';
import { BankingEnterpriseController } from '../banking-enterprise/banking-enterprise.controller.js';
import { BillingEntitlementsController } from '../billing/billing-entitlements.controller.js';
import { BusinessRulesController } from '../business-rules/business-rules.controller.js';
import { CommandCenterEnterpriseController } from '../command-center-enterprise/command-center-enterprise.controller.js';
import { ComplianceEnterpriseController } from '../compliance-enterprise/compliance-enterprise.controller.js';
import { DigitalCertificatesEnterpriseController } from '../digital-certificates/digital-certificates-enterprise.controller.js';
import { FinanceOperationsEnterpriseController } from '../finance-operations-enterprise/finance-operations-enterprise.controller.js';
import { ComplianceController as FiscalComplianceController } from '../fiscal/compliance/compliance.controller.js';
import { DashboardController as FiscalDashboardController } from '../fiscal/dashboard/dashboard.controller.js';
import { DfeController } from '../fiscal/dfe/dfe.controller.js';
import { FiscalController } from '../fiscal/fiscal.controller.js';
import { PayrollController as FiscalPayrollController } from '../fiscal/payroll/payroll.controller.js';
import { TaxController } from '../fiscal/tax/tax.controller.js';
import { NotificationController } from '../notifications/notification.controller.js';
import { NotificationsEnterpriseController } from '../notifications-enterprise/notifications-enterprise.controller.js';
import { ObligationsEnterpriseController } from '../obligations/obligations-enterprise.controller.js';
import { PayrollEnterpriseController } from '../payroll-enterprise/payroll-enterprise.controller.js';
import { ReconciliationController } from '../reconciliation/scoring/reconciliation.controller.js';
import { BillingController } from '../revenue/billing.controller.js';

const TENANT_GUARD_CHAIN = [
  JwtAuthGuard,
  TenantContextGuard,
  CompanyAccessGuard,
];

const COMPANY_SCOPED_ENTERPRISE_CONTROLLERS = [
  AccountingEnterpriseController,
  AuditController,
  AuditIntelligenceEnterpriseController,
  AutomationJobsEnterpriseController,
  BankingController,
  BankingEnterpriseController,
  BillingEntitlementsController,
  BillingController,
  BusinessRulesController,
  CommandCenterEnterpriseController,
  ComplianceEnterpriseController,
  DigitalCertificatesEnterpriseController,
  DfeController,
  FinanceOperationsEnterpriseController,
  FiscalComplianceController,
  FiscalDashboardController,
  FiscalController,
  FiscalPayrollController,
  NotificationController,
  NotificationsEnterpriseController,
  ObligationsEnterpriseController,
  PayrollEnterpriseController,
  ReconciliationController,
  TaxController,
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
