import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('payroll enterprise query limits contract', () => {
  const source = readFileSync(
    join(__dirname, '..', 'modules', 'payroll-enterprise', 'payroll-enterprise.service.ts'),
    'utf8',
  );

  it('keeps explicit limits for payroll summary aggregate queries', () => {
    expect(source).toContain('private static readonly SUMMARY_LIMIT_MAX = 5000');
    expect(source).toContain('this.employeeModel.findMany({');
    expect(source).toContain('take: PayrollEnterpriseService.SUMMARY_LIMIT_MAX');
    expect(source).toContain('this.payrollModel.findMany({');
    expect(source).toContain('this.payrollEntryModel.findMany({');
  });

  it('centralizes page limit constants instead of scattering magic numbers', () => {
    expect(source).toContain('private static readonly PAGE_LIMIT_DEFAULT = 100');
    expect(source).toContain('private static readonly PAGE_LIMIT_MAX = 500');
    expect(source).not.toContain('Number(query.limit || 100), 1), 500');
  });
});
