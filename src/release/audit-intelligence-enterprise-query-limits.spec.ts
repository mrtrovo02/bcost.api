import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('audit intelligence enterprise query limits contract', () => {
  const source = readFileSync(
    join(
      __dirname,
      '..',
      'modules',
      'audit-intelligence-enterprise',
      'audit-intelligence-enterprise.service.ts',
    ),
    'utf8',
  );

  it('keeps audit samples and raw payload pagination bounded', () => {
    expect(source).toContain(
      'private static readonly PAGE_LIMIT_DEFAULT = 100',
    );
    expect(source).toContain('private static readonly PAGE_LIMIT_MAX = 500');
    expect(source).toContain(
      'AuditIntelligenceEnterpriseService.PAGE_LIMIT_DEFAULT',
    );
    expect(source).toContain(
      'AuditIntelligenceEnterpriseService.PAGE_LIMIT_MAX',
    );
    expect(source).not.toContain('Number(query.limit || 100), 1), 500');
  });

  it('keeps audit lookback bounded to avoid unbounded operational scans', () => {
    expect(source).toContain('private static readonly LOOKBACK_DEFAULT = 300');
    expect(source).toContain('private static readonly LOOKBACK_MAX = 3000');
    expect(source).toContain(
      'AuditIntelligenceEnterpriseService.LOOKBACK_DEFAULT',
    );
    expect(source).toContain('AuditIntelligenceEnterpriseService.LOOKBACK_MAX');
    expect(source).not.toContain('Number(query.lookback || 300), 1), 3000');
  });
});
