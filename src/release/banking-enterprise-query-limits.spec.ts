import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('banking enterprise query limits contract', () => {
  const source = readFileSync(
    join(__dirname, '..', 'modules', 'banking-enterprise', 'banking-enterprise.service.ts'),
    'utf8',
  );

  it('keeps bounded pagination for banking account and transaction lists', () => {
    expect(source).toContain('private static readonly PAGE_LIMIT_DEFAULT = 100');
    expect(source).toContain('private static readonly PAGE_LIMIT_MAX = 500');
    expect(source).toContain('BankingEnterpriseService.PAGE_LIMIT_DEFAULT');
    expect(source).toContain('BankingEnterpriseService.PAGE_LIMIT_MAX');
    expect(source).not.toContain('Number(query.limit || 100), 1), 500');
    expect(source).not.toContain('Number(dto.limit || 100), 1), 500');
  });

  it('keeps reconciliation candidate and summary queries capped', () => {
    expect(source).toContain('private static readonly RECONCILIATION_CANDIDATE_LIMIT = 50');
    expect(source).toContain('private static readonly SUMMARY_TRANSACTION_LIMIT = 5000');
    expect(source).toContain('take: BankingEnterpriseService.RECONCILIATION_CANDIDATE_LIMIT');
    expect(source).toContain('take: BankingEnterpriseService.SUMMARY_TRANSACTION_LIMIT');
  });
});
